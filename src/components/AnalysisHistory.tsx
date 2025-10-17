import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { projectId } from '../utils/supabase/info';
import { getAuthHeaders } from '../utils/supabase/auth';

interface AnalysisHistoryProps {
  accessToken: string | null;
}

interface HistoryItem {
  id: string;
  ingredients: string;
  analysis: {
    isClean?: boolean;
    score?: number;
    hits?: string[];
    flaggedIngredients?: string[];
    warnings?: string[];
    dietHits?: string[];
    dietPreference?: string | null;
  };
  timestamp: string;
}

export function AnalysisHistory({ accessToken }: AnalysisHistoryProps) {
  const [allHistory, setAllHistory] = useState<HistoryItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [matchesCount, setMatchesCount] = useState(0);

  const fetchHistory = useCallback(async () => {
    if (!accessToken) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5111eaf7/analysis/history`, {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(accessToken),
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch history');
      }

      const sorted = (result.analyses || []).sort(
        (a: HistoryItem, b: HistoryItem) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      setAllHistory(sorted);
    } catch (error: any) {
      console.error('Error fetching history:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchHistory();
  }, [accessToken, fetchHistory]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && history.length > 0) {
      console.debug('History sample entry', history[0]);
    }
  }, [history]);

  const rangeError = useMemo(() => {
    if (startDate && endDate) {
      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate).getTime();
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && startMs > endMs) {
        return 'Start date cannot be after end date.';
      }
    }
    return '';
  }, [startDate, endDate]);

  useEffect(() => {
    if (rangeError) {
      setHistory([]);
      return;
    }

    const limit = startDate || endDate ? 50 : 10;
    const startMs = startDate
      ? (() => {
          const parts = startDate.split('-').map((part) => Number(part));
          if (parts.length === 3 && parts.every((value) => !Number.isNaN(value))) {
            const [year, month, day] = parts;
            return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
          }
          return new Date(startDate).getTime();
        })()
      : Number.NEGATIVE_INFINITY;
    const endMs = endDate
      ? (() => {
          const parts = endDate.split('-').map((part) => Number(part));
          if (parts.length === 3 && parts.every((value) => !Number.isNaN(value))) {
            const [year, month, day] = parts;
            return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
          }
          return new Date(endDate).getTime();
        })()
      : Number.POSITIVE_INFINITY;

    const filtered = allHistory.filter((item) => {
      const ts = new Date(item.timestamp).getTime();
      if (Number.isNaN(ts)) return false;
      return ts >= startMs && ts <= endMs;
    });

    setMatchesCount(filtered.length);
    setHistory(filtered.slice(0, limit));
  }, [allHistory, startDate, endDate, rangeError]);

  if (!accessToken) {
    return (
      <Alert>
        <AlertDescription>
          Sign in to view your analysis history and track your clean eating journey.
        </AlertDescription>
      </Alert>
    );
  }

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h3 className="text-lg">Analysis History</h3>
          <p className="text-sm text-muted-foreground">
            {startDate || endDate
              ? 'Filtered results based on your selected date range (maximum 50 entries).'
              : 'Showing your 10 most recent analyses. Add a date range to explore more (max 50).'}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="history-start-date">Start date</Label>
            <Input
              id="history-start-date"
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(event) => setStartDate(event.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="history-end-date">End date</Label>
            <Input
              id="history-end-date"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => setEndDate(event.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-1">
            <Label>&nbsp;</Label>
            <Input
              type="text"
              readOnly
              value={`Showing ${history.length} of ${Math.min(matchesCount, startDate || endDate ? 50 : 10)} records`}
              className="bg-muted/40 text-sm text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {rangeError && (
        <Alert variant="destructive">
          <AlertDescription>{rangeError}</AlertDescription>
        </Alert>
      )}

      {history.length === 0 && !isLoading && (
        <Alert>
          <AlertDescription>
            No analysis history yet. Start analyzing food ingredients to build your history!
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {history.map((item) => {
          let rawAnalysis = item.analysis as unknown;
          if (typeof rawAnalysis === 'string') {
            try {
              rawAnalysis = JSON.parse(rawAnalysis);
            } catch (err) {
              console.warn('Failed to parse stored analysis payload', err);
            }
          }

          const mergedAnalysis = rawAnalysis && typeof rawAnalysis === 'object'
            ? {
                ...(rawAnalysis as Record<string, unknown>),
                ...(
                  typeof (rawAnalysis as any).analysis === 'object' && (rawAnalysis as any).analysis !== null
                    ? ((rawAnalysis as any).analysis as Record<string, unknown>)
                    : {}
                ),
              }
            : ((rawAnalysis as Record<string, unknown>) ?? {});

          const isCleanRaw = mergedAnalysis.isClean ?? mergedAnalysis.is_clean;
          let isClean = false;
          if (typeof isCleanRaw === 'boolean') {
            isClean = isCleanRaw;
          } else if (typeof isCleanRaw === 'string') {
            isClean = isCleanRaw.toLowerCase() === 'true';
          } else if (typeof isCleanRaw === 'number') {
            isClean = isCleanRaw === 1;
          }
          const dietHitsRaw = mergedAnalysis.dietHits ?? mergedAnalysis.diet_hits ?? [];
          const dietHits = Array.isArray(dietHitsRaw)
            ? dietHitsRaw
            : dietHitsRaw && typeof dietHitsRaw === 'object'
              ? Object.values(dietHitsRaw as Record<string, unknown>).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
              : [];
          const dietPrefRaw = mergedAnalysis.dietPreference ?? mergedAnalysis.diet_preference ?? null;
          const dietPref = typeof dietPrefRaw === 'string' && dietPrefRaw !== 'none'
            ? dietPrefRaw
            : null;
          const hitsRaw = mergedAnalysis.hits ?? [];
          const hits = Array.isArray(hitsRaw)
            ? hitsRaw
            : hitsRaw && typeof hitsRaw === 'object'
              ? Object.values(hitsRaw as Record<string, unknown>).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
              : [];
          const flaggedRaw = mergedAnalysis.flaggedIngredients ?? mergedAnalysis.flagged_ingredients ?? hits;
          const flagged = Array.isArray(flaggedRaw) ? flaggedRaw : hits;
          const parsedIngredientsRaw = mergedAnalysis.parsedIngredients ?? mergedAnalysis.parsed_ingredients ?? [];
          const parsedIngredients = Array.isArray(parsedIngredientsRaw)
            ? parsedIngredientsRaw
            : parsedIngredientsRaw && typeof parsedIngredientsRaw === 'object'
              ? Object.values(parsedIngredientsRaw as Record<string, unknown>).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
              : [];
          const hasDietConflict = dietPref && dietHits.length > 0;
          const allergyHitsRaw = mergedAnalysis.allergyHits ?? mergedAnalysis.allergy_hits ?? [];
          const allergyHits = Array.isArray(allergyHitsRaw)
            ? allergyHitsRaw
            : allergyHitsRaw && typeof allergyHitsRaw === 'object'
              ? Object.values(allergyHitsRaw as Record<string, unknown>).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
              : [];
          const allergyPrefsRaw = mergedAnalysis.allergyPreferences ?? mergedAnalysis.allergy_preferences ?? [];
          const allergyPreferences = Array.isArray(allergyPrefsRaw)
            ? allergyPrefsRaw
            : allergyPrefsRaw && typeof allergyPrefsRaw === 'object'
              ? Object.values(allergyPrefsRaw as Record<string, unknown>).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
              : [];
          const hasAllergyConflict = allergyHits.length > 0;
          const hasHits = hits.length > 0 || flagged.length > 0;
          let status: 'notClean' | 'diet' | 'allergy' | 'clean' = hasHits || isClean === false
            ? 'notClean'
            : hasAllergyConflict
              ? 'allergy'
              : hasDietConflict
                ? 'diet'
                : 'clean';

          const htmlSummary = typeof mergedAnalysis.html === 'string' ? mergedAnalysis.html : '';
          if (status === 'clean' && htmlSummary) {
            if (htmlSummary.includes('❌ Not Clean')) {
              status = 'notClean';
            } else if (htmlSummary.includes('⚠️ Matches')) {
              status = 'allergy';
            } else if (htmlSummary.includes('⚠️ Not suitable') || htmlSummary.includes('⚠️ Conflicts')) {
              status = 'diet';
            }
          }

          const StatusIcon = status === 'notClean' ? XCircle : status === 'clean' ? CheckCircle : AlertTriangle;
          const iconColor = status === 'notClean'
            ? 'rgb(220 38 38)'
            : status === 'clean'
              ? 'rgb(22 163 74)'
              : 'rgb(217 119 6)';
          const statusLabel = status === 'notClean'
            ? 'Not Clean'
            : status === 'clean'
              ? 'Clean'
              : 'Clean, but not for you';
          return (
          <Card key={item.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <StatusIcon className="h-5 w-5" style={{ color: iconColor }} />
                  {statusLabel}
                </CardTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {formatDate(item.timestamp)}
                </div>
              </div>
              <CardDescription>
                {status === 'diet' && (
                  <span className="ml-2 text-sm text-amber-600">
                    Conflicts with your {dietPref} preference
                  </span>
                )}
                {status === 'allergy' && allergyPreferences.length > 0 && (
                  <span className="ml-2 text-sm text-amber-600">
                    Matches your {allergyPreferences.join(', ')} allergies
                  </span>
                )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
              <div>
                <h5 className="text-sm mb-2">Parsed Ingredients</h5>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {parsedIngredients.length > 0
                    ? parsedIngredients.join(', ')
                    : item.ingredients}
                </p>
              </div>

              {flagged.length > 0 && (
                <div>
                  <h5 className="text-sm mb-2">Flagged Ingredients</h5>
                  <div className="flex flex-wrap gap-1">
                    {flagged.map((ingredient, index) => (
                      <Badge key={index} variant="destructive" className="text-xs">
                        {ingredient}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {hasDietConflict && (
                <div>
                  <h5 className="text-sm mb-2">Dietary Preference Conflicts</h5>
                  <div className="flex flex-wrap gap-1">
                    {dietHits.map((ingredient, index) => (
                      <Badge key={`diet-${ingredient}-${index}`} variant="destructive" className="text-xs">
                        {ingredient}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {hasAllergyConflict && (
                <div>
                  <h5 className="text-sm mb-2">Allergy Matches</h5>
                  <div className="flex flex-wrap gap-1">
                    {allergyHits.map((ingredient, index) => (
                      <Badge key={index} variant="destructive" className="text-xs">
                        {ingredient}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );})}
      </div>
    </div>
  );
}
