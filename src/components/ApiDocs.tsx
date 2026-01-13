import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { Separator } from './ui/separator';
import {
  AlertTriangle,
  Book,
  CheckCircle,
  Code,
  Copy,
  ExternalLink,
  FileCode,
  Lock,
  Zap,
} from 'lucide-react';
import openApiSpec from '../../openapi3.0.yaml?raw';

type ParsedSpec = {
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description?: string }>;
  tags: string[];
  endpoints: Array<{
    path: string;
    method: string;
    summary?: string;
    description?: string;
    operationId?: string;
    tags: string[];
    responses: string[];
    hasRequestBody: boolean;
    requestExample?: string;
    responseExample?: string;
  }>;
  schemas: Array<{ name: string; block: string }>;
  security: {
    schemeName?: string;
    headerName?: string;
  };
  raw: string;
};

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

const stripQuotes = (value: string) => value.replace(/^['"]|['"]$/g, '');
const getIndent = (line: string) => line.match(/^\s*/)?.[0].length ?? 0;

const getBlockLines = (lines: string[], key: string, indent: number) => {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (getIndent(line) !== indent) continue;
    if (!line.trim().startsWith(`${key}:`)) continue;
    const start = i + 1;
    let end = start;
    for (; end < lines.length; end += 1) {
      const next = lines[end];
      if (next.trim().length === 0) continue;
      if (getIndent(next) <= indent) break;
    }
    return lines.slice(start, end);
  }
  return [];
};

const readScalar = (lines: string[], key: string) => {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed.startsWith(`${key}:`)) continue;
    const after = trimmed.slice(key.length + 1).trim();
    const indent = getIndent(line);
    if (after === '|' || after === '>') {
      const block: string[] = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j];
        if (next.trim().length === 0) {
          block.push('');
          continue;
        }
        if (getIndent(next) <= indent) break;
        block.push(next.slice(Math.min(next.length, indent + 2)));
      }
      return block.join('\n').trim();
    }
    return stripQuotes(after);
  }
  return '';
};

const parseServers = (lines: string[]) => {
  const servers: ParsedSpec['servers'] = [];
  let current: { url: string; description?: string } | null = null;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('- url:')) {
      if (current) servers.push(current);
      const url = stripQuotes(trimmed.replace('- url:', '').trim());
      current = { url };
      return;
    }
    if (current && trimmed.startsWith('description:')) {
      current.description = stripQuotes(trimmed.replace('description:', '').trim());
    }
  });

  if (current) servers.push(current);
  return servers;
};

const parseTags = (lines: string[]) =>
  lines
    .filter((line) => line.trim().startsWith('- name:'))
    .map((line) => stripQuotes(line.trim().replace('- name:', '').trim()))
    .filter(Boolean);

const parseResponses = (lines: string[]) => {
  const codes = new Set<string>();
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (/^"\d{3}"\s*:/.test(trimmed)) {
      codes.add(trimmed.replace(':', '').replace(/"/g, '').trim());
    }
  });
  return Array.from(codes);
};

const parseMethodTags = (lines: string[]) => {
  const tags: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('tags:')) continue;
    const after = trimmed.slice(5).trim();
    if (after.startsWith('[')) {
      const inline = after.replace(/\[|\]/g, '').split(',');
      inline.forEach((tag) => {
        const clean = tag.trim();
        if (clean) tags.push(clean);
      });
    }
  }
  return tags;
};

const extractExample = (lines: string[]) => {
  let inExamples = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('examples:')) {
      inExamples = true;
      continue;
    }
    if (!inExamples) continue;
    if (trimmed.startsWith('value:')) {
      const indent = getIndent(line);
      const block: string[] = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j];
        if (next.trim().length === 0) {
          block.push('');
          continue;
        }
        if (getIndent(next) <= indent) break;
        block.push(next.slice(Math.min(next.length, indent + 2)));
      }
      return block.join('\n').trim();
    }
  }
  return '';
};

const parsePaths = (lines: string[]) => {
  const endpoints: ParsedSpec['endpoints'] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const indent = getIndent(line);
    const trimmed = line.trim();

    if (indent === 2 && trimmed.endsWith(':')) {
      const path = trimmed.slice(0, -1);
      i += 1;
      while (i < lines.length) {
        const methodLine = lines[i];
        const methodIndent = getIndent(methodLine);
        const methodTrimmed = methodLine.trim();

        if (methodIndent <= 2) break;

        if (methodIndent === 4 && methodTrimmed.endsWith(':')) {
          const method = methodTrimmed.slice(0, -1);
          if (!HTTP_METHODS.has(method)) {
            i += 1;
            continue;
          }

          i += 1;
          const methodLines: string[] = [];
          while (i < lines.length) {
            const next = lines[i];
            const nextIndent = getIndent(next);
            if (nextIndent <= 4) break;
            methodLines.push(next);
            i += 1;
          }

          const requestBlock = getBlockLines(methodLines, 'requestBody', 6);
          const responseBlock = getBlockLines(methodLines, 'responses', 6);

          endpoints.push({
            path,
            method,
            summary: readScalar(methodLines, 'summary'),
            description: readScalar(methodLines, 'description'),
            operationId: readScalar(methodLines, 'operationId'),
            tags: parseMethodTags(methodLines),
            responses: parseResponses(methodLines),
            hasRequestBody: methodLines.some((methodLine) => methodLine.trim().startsWith('requestBody:')),
            requestExample: extractExample(requestBlock),
            responseExample: extractExample(responseBlock),
          });

          continue;
        }

        i += 1;
      }

      continue;
    }

    i += 1;
  }

  return endpoints;
};

const parseSchemas = (lines: string[]) => {
  const schemas: ParsedSpec['schemas'] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const indent = getIndent(line);
    const trimmed = line.trim();

    if (indent === 4 && trimmed.endsWith(':')) {
      const name = trimmed.slice(0, -1);
      i += 1;
      const block: string[] = [];
      while (i < lines.length) {
        const next = lines[i];
        const nextIndent = getIndent(next);
        if (nextIndent <= 4) break;
        block.push(next.slice(6));
        i += 1;
      }
      schemas.push({ name, block: block.join('\n').trim() });
      continue;
    }

    i += 1;
  }

  return schemas;
};

const parseSecurity = (lines: string[]) => {
  const securitySchemes = getBlockLines(lines, 'securitySchemes', 2);
  const schemeLine = securitySchemes.find((line) => getIndent(line) === 4 && line.trim().endsWith(':'));
  const schemeName = schemeLine ? schemeLine.trim().slice(0, -1) : undefined;
  let headerName: string | undefined;

  if (schemeName) {
    for (const line of securitySchemes) {
      if (line.trim().startsWith('name:')) {
        headerName = stripQuotes(line.trim().replace('name:', '').trim());
        break;
      }
    }
  }

  return { schemeName, headerName };
};

const formatSampleValue = (value: string) =>
  value
    .replace(/\{barcode\}/g, '8901234567890')
    .replace(/\{userId\}/g, 'usr_123')
    .replace(/\{[^}]+\}/g, 'id_123');

const buildSampleRequest = (endpoint: ParsedSpec['endpoints'][number], baseUrl: string) => {
  const path = formatSampleValue(endpoint.path);
  const needsBody = endpoint.hasRequestBody;
  const lines = [
    `curl -X ${endpoint.method.toUpperCase()} "${baseUrl}${path}"`,
    '  -H "X-API-Key: YOUR_API_KEY"',
  ];

  if (needsBody) {
    lines.push('  -H "Content-Type: application/json"');
    lines.push('  -d \'{"sample": true, "note": "Replace with real payload"}\'');
  }

  return lines.join(' \\\n');
};

const buildSampleResponse = (endpoint: ParsedSpec['endpoints'][number]) => {
  const status = endpoint.responses[0] || '200';
  return JSON.stringify(
    {
      status: Number(status) || 200,
      request_id: `req_${endpoint.method}_123`,
      ok: true,
      message: 'Sample response payload.',
    },
    null,
    2,
  );
};

const parseOpenApiSpec = (raw: string): ParsedSpec => {
  const lines = raw.split(/\r?\n/);
  const infoLines = getBlockLines(lines, 'info', 0);
  const serverLines = getBlockLines(lines, 'servers', 0);
  const tagLines = getBlockLines(lines, 'tags', 0);
  const pathLines = getBlockLines(lines, 'paths', 0);
  const componentsLines = getBlockLines(lines, 'components', 0);
  const schemaLines = getBlockLines(componentsLines, 'schemas', 2);

  return {
    info: {
      title: readScalar(infoLines, 'title') || 'API Documentation',
      version: readScalar(infoLines, 'version') || '1.0.0',
      description: readScalar(infoLines, 'description') || '',
    },
    servers: parseServers(serverLines),
    tags: parseTags(tagLines),
    endpoints: parsePaths(pathLines),
    schemas: parseSchemas(schemaLines),
    security: parseSecurity(componentsLines),
    raw,
  };
};

const useSpec = () => useMemo(() => parseOpenApiSpec(openApiSpec), []);

export function ApiDocs() {
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);
  const spec = useSpec();
  const rawSpecUrl = useMemo(
    () => URL.createObjectURL(new Blob([spec.raw], { type: 'text/yaml' })),
    [spec.raw],
  );

  useEffect(() => () => URL.revokeObjectURL(rawSpecUrl), [rawSpecUrl]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEndpoint(id);
    setTimeout(() => setCopiedEndpoint(null), 2000);
  };

  const CodeBlock = ({
    children,
    language = 'bash',
    copyId,
    copyText,
    copyOnClick = false,
    title,
  }: {
    children: string;
    language?: string;
    copyId?: string;
    copyText?: string;
    copyOnClick?: boolean;
    title?: string;
  }) => {
    const textToCopy = copyText ?? children;
    const handleCopy = (event?: MouseEvent) => {
      event?.stopPropagation();
      if (!copyId) return;
      copyToClipboard(textToCopy, copyId);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (!copyOnClick) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleCopy();
      }
    };

    return (
      <div
        className={`relative overflow-hidden rounded-lg border border-border/60 bg-muted/50 ${
          copyOnClick ? 'cursor-pointer' : ''
        }`}
        onClick={copyOnClick ? () => handleCopy() : undefined}
        onKeyDown={handleKeyDown}
        role={copyOnClick ? 'button' : undefined}
        tabIndex={copyOnClick ? 0 : undefined}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/70 px-4 py-2 text-sm font-medium text-muted-foreground">
            <span>{title}</span>
            {copyId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleCopy}
                aria-label="Copy code"
              >
                {copiedEndpoint === copyId ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        )}
        <pre className="text-foreground p-4 overflow-x-auto text-sm font-mono">
          <code className={`language-${language}`}>{children}</code>
        </pre>
        {!title && copyId && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 h-8 w-8 p-0 bg-background/70 backdrop-blur"
            onClick={handleCopy}
            aria-label="Copy code"
          >
            {copiedEndpoint === copyId ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    );
  };

  const authHeader = spec.security.headerName || 'X-API-Key';
  const primaryServer = spec.servers[0]?.url ?? 'https://api.example.com';
  const exampleEndpoint = spec.endpoints[0];
  const examplePath = exampleEndpoint?.path ?? '/health';
  const exampleMethod = exampleEndpoint?.method ?? 'get';
  const needsBody = exampleEndpoint?.hasRequestBody ?? false;
  const curlLines = [
    `curl -X ${exampleMethod.toUpperCase()} "${primaryServer}${examplePath}"`,
    `  -H "${authHeader}: YOUR_API_KEY"`,
  ];
  if (needsBody) {
    curlLines.push('  -H "Content-Type: application/json"');
    curlLines.push('  -d "{}"');
  }

  const endpointGroups = spec.endpoints.reduce<Record<string, ParsedSpec['endpoints']>>(
    (acc, endpoint) => {
      const key = endpoint.tags[0] || 'General';
      if (!acc[key]) acc[key] = [];
      acc[key].push(endpoint);
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-3xl">
                <FileCode className="h-8 w-8 text-blue-600" />
                {spec.info.title}
              </CardTitle>
              <CardDescription className="mt-2 text-base">
                {spec.info.description || 'Explore the Clean Eats API capabilities and endpoints.'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-sm">
                Version {spec.info.version}
              </Badge>
              <Button variant="ghost" size="sm" asChild>
                <a href={rawSpecUrl} download="openapi3.0.yaml">
                  <ExternalLink className="h-4 w-4" />
                  Raw Spec
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="quickstart">Quickstart</TabsTrigger>
          <TabsTrigger value="auth">Auth</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="schemas">Schemas</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Book className="h-5 w-5 text-blue-600" />
                What is this API?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground whitespace-pre-line">
                {spec.info.description || 'A structured API for product analysis, OCR, and user preferences.'}
              </p>
              <Alert>
                <Zap className="h-4 w-4" />
                <AlertDescription>
                  Use the OpenAPI spec to explore every endpoint, schema, and response example in one place.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Base URLs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {spec.servers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No servers defined in the spec.</p>
              ) : (
                spec.servers.map((server, index) => (
                  <div
                    key={`${server.url}-${index}`}
                    className={`border-l-4 pl-4 ${index === 0 ? 'border-blue-500' : 'border-green-500'}`}
                  >
                    <p className="font-mono text-sm">
                      <Badge variant="outline" className="mr-2">
                        {server.description || (index === 0 ? 'Primary' : 'Secondary')}
                      </Badge>
                      {server.url}
                    </p>
                    {server.description && (
                      <p className="text-sm text-muted-foreground mt-1">{server.description}</p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Authentication</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-3">
                Requests require an API key passed in the header.
                {spec.security.schemeName
                  ? ` Scheme: ${spec.security.schemeName}.`
                  : ''}
              </p>
              <CodeBlock copyId="auth-header" copyOnClick title="Auth header">
                {`${authHeader}: YOUR_API_KEY`}
              </CodeBlock>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tags & Capabilities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {spec.tags.length === 0 ? (
                  <Badge variant="outline">General</Badge>
                ) : (
                  spec.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quickstart" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5 text-blue-600" />
                First request
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Try the first endpoint defined in the spec using your API key.
              </p>
              <CodeBlock copyId="quickstart-curl" copyOnClick title="Quickstart request">
                {curlLines.join(' \\\n')}
              </CodeBlock>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Need more examples?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-muted-foreground">
                Use the endpoint cards to copy request snippets and review available response codes.
              </p>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Always send your API key over HTTPS and avoid sharing keys in client-side apps.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auth" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-blue-600" />
                API Key Authentication
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                This API uses an API key passed via the <code>{authHeader}</code> header.
              </p>
              <CodeBlock copyId="auth-example" copyOnClick title="Auth header">{`\
${authHeader}: YOUR_API_KEY`}</CodeBlock>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Rotate keys regularly and store them in secure environment variables.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="endpoints" className="space-y-6">
          {Object.entries(endpointGroups).map(([group, endpoints]) => (
            <Card key={group}>
              <CardHeader>
                <CardTitle>{group}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {endpoints.map((endpoint) => {
                  const snippet = `${endpoint.method.toUpperCase()} ${endpoint.path}`;
                  const id = `${endpoint.method}-${endpoint.path}`;
                  const requestSample = buildSampleRequest(endpoint, primaryServer);
                  const responseSample = buildSampleResponse(endpoint);
                  return (
                    <div key={id} className="rounded-lg border p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary">{endpoint.method.toUpperCase()}</Badge>
                          <span className="font-mono text-sm">{endpoint.path}</span>
                        </div>
                      </div>
                      {endpoint.summary && <p className="font-medium">{endpoint.summary}</p>}
                      {endpoint.description && (
                        <p className="text-sm text-muted-foreground whitespace-pre-line">
                          {endpoint.description}
                        </p>
                      )}
                      <div className="space-y-2">
                        <CodeBlock copyId={`endpoint-${id}`} copyOnClick language="bash" title="Request">
                          {buildSampleRequest(endpoint, primaryServer)}
                        </CodeBlock>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {endpoint.operationId && <span>operationId: {endpoint.operationId}</span>}
                        {endpoint.responses.length > 0 && (
                          <span>responses: {endpoint.responses.join(', ')}</span>
                        )}
                        {endpoint.hasRequestBody && <span>body: required</span>}
                      </div>
                      <Separator />
                      <div className="space-y-3">
                        <div>
                          <CodeBlock copyId={`request-${id}`} language="bash" copyOnClick title="Sample request">
                            {requestSample}
                          </CodeBlock>
                        </div>
                        <div>
                          <CodeBlock copyId={`response-${id}`} language="json" copyOnClick title="Sample response">
                            {responseSample}
                          </CodeBlock>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="schemas" className="space-y-6">
          {spec.schemas.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No schemas found</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  The spec does not define schemas under <code>components.schemas</code>.
                </p>
              </CardContent>
            </Card>
          ) : (
            spec.schemas.map((schema) => (
              <Card key={schema.name}>
                <CardHeader>
                  <CardTitle>{schema.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CodeBlock copyId={`schema-${schema.name}`} language="yaml" copyOnClick title="Schema">
                    {schema.block}
                  </CodeBlock>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="errors" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Error handling</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                The API returns standard HTTP status codes along with a structured error response.
              </p>
              <CodeBlock copyId="error-schema" language="yaml" copyOnClick title="Error schema">
                {spec.schemas.find((schema) => schema.name === 'ErrorResponse')?.block ||
                  'error:\n  code: STRING\n  message: STRING\n  details: OBJECT'}
              </CodeBlock>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Typical error responses include <code>400</code> for validation and <code>401</code> for auth issues.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <Separator />
    </div>
  );
}
