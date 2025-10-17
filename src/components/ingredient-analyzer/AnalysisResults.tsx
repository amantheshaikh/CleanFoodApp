import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { CheckCircle, XCircle, AlertTriangle, Info, Leaf } from 'lucide-react';
import { cn } from '../ui/utils';
import type { AvoidGuideMatch } from '../../data/avoidList';

interface TaxonomyEntry {
  id?: string;
  display?: string;
  parents?: string[];
  synonyms?: string[];
  source?: string;
}

interface AnalysisResult {
  isClean: boolean;
  hits: string[];
  parsedIngredients: string[];
  canonical: string[];
  taxonomy: TaxonomyEntry[];
  source: string;
  html?: string;
  taxonomyError?: string | null;
  additivesError?: string | null;
  dietHits?: string[];
  dietPreference?: string | null;
  allergyHits?: string[];
  allergyPreferences?: string[];
}

interface FlaggedIngredientBadge {
  key: string;
  label: string;
  match: AvoidGuideMatch | null;
  original: string;
}

export interface AnalysisResultsProps {
  analysis: AnalysisResult;
  flaggedMatches: FlaggedIngredientBadge[];
  dietPreferenceLabel: string | null;
  onNavigateToGuide?: (payload: {
    section: AvoidGuideMatch['section'];
    slug: string;
    name: string;
  }) => void;
}

export function AnalysisResults({ analysis, flaggedMatches, dietPreferenceLabel, onNavigateToGuide }: AnalysisResultsProps) {
  const hasDietConflict = Boolean(dietPreferenceLabel && analysis.dietHits && analysis.dietHits.length > 0);
  const hasAllergyConflict = Boolean(analysis.allergyHits && analysis.allergyHits.length > 0);
  const cardStatus = !analysis.isClean
    ? 'notClean'
    : hasDietConflict || hasAllergyConflict
      ? 'preferenceConflict'
      : 'clean';
  const title = cardStatus === 'clean'
    ? 'Clean'
    : cardStatus === 'preferenceConflict'
      ? 'Clean, but not for you'
      : 'Not clean';
  const dietReason = analysis.dietHits && analysis.dietHits.length > 0 ? analysis.dietHits.join(', ') : null;
  const selectedAllergies = Array.isArray(analysis.allergyPreferences) ? analysis.allergyPreferences : [];
  const uniqueAllergies = Array.from(new Set(selectedAllergies));
  const allergyHits = Array.isArray(analysis.allergyHits) ? analysis.allergyHits : [];
  const allergyHeaderClass = hasAllergyConflict ? 'text-red-600' : 'text-emerald-600';
  const AllergyHeaderIcon = hasAllergyConflict ? AlertTriangle : CheckCircle;
  const description = cardStatus === 'clean'
    ? 'We did not detect any red-flag additives or personalised issues.'
    : cardStatus === 'preferenceConflict'
      ? null
      : 'The analyzer detected red-flag ingredients.';
  const infoBannerShow = analysis.source && analysis.source !== 'unknown';

  return (
    <div className="space-y-6">
      <Card className={cn(cardStatus === 'notClean' && 'border-red-200 bg-red-50/40', cardStatus === 'preferenceConflict' && 'border-amber-200 bg-amber-50/40', cardStatus === 'clean' && 'border-emerald-200 bg-emerald-50/40')}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            {cardStatus === 'clean' ? (
              <CheckCircle className="h-6 w-6 text-emerald-600" />
            ) : cardStatus === 'preferenceConflict' ? (
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            ) : (
              <XCircle className="h-6 w-6 text-red-600" />
            )}
            {title}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-6">
          {flaggedMatches.length > 0 && (
            <div className="space-y-3 text-left">
              <h3 className="font-semibold">Flagged Ingredients</h3>
              <div className="flex flex-wrap gap-2">
                {flaggedMatches.map((item) => (
                  <Badge
                    key={item.key}
                    variant="destructive"
                    className="cursor-pointer"
                    onClick={() => {
                      if (item.match && onNavigateToGuide) {
                        onNavigateToGuide({
                          section: item.match.section,
                          slug: item.match.slug,
                          name: item.match.name,
                        });
                      }
                    }}
                  >
                    {item.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {dietPreferenceLabel && (
            <div className="space-y-3 text-left">
              <h3 className="font-semibold">Dietary Fit</h3>
              <Alert variant={hasDietConflict ? 'destructive' : 'default'}>
                <AlertDescription>
                  {hasDietConflict ? (
                    <>
                      <p>
                        This product conflicts with your <strong>{dietPreferenceLabel}</strong> preference.
                      </p>
                      {dietReason && <p>Reasons: {dietReason}</p>}
                    </>
                  ) : (
                    <p>
                      This product appears compatible with your <strong>{dietPreferenceLabel}</strong> preference.
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            </div>
          )}

          {uniqueAllergies.length > 0 && (
            <div className="space-y-3 text-left">
              <h3 className="font-semibold flex items-center gap-2">
                <AllergyHeaderIcon className={allergyHeaderClass} />
                Allergy Check
              </h3>
              {hasAllergyConflict ? (
                <Alert variant="destructive">
                  <AlertDescription className="space-y-2">
                    <p>
                      We detected ingredients that match your tracked allergies ({uniqueAllergies.join(', ')}).
                    </p>
                    <ul className="list-disc list-inside text-left text-sm">
                      {allergyHits.map((hit) => (
                        <li key={hit}>{hit}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
                  No ingredients matched your allergies ({uniqueAllergies.join(', ')}).
                </div>
              )}
            </div>
          )}

          {analysis.parsedIngredients.length > 0 && (
            <div>
              <h4 className="mb-2">Parsed Ingredients</h4>
              <div className="flex flex-wrap gap-2">
                {analysis.parsedIngredients.map((ingredient, index) => (
                  <Badge key={`${ingredient}-${index}`} variant="outline">
                    {ingredient}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {analysis.taxonomy.length > 0 && (
            <div className="space-y-3">
              <h4 className="mb-2">Ingredient Details</h4>
              <div className="space-y-3">
                {analysis.taxonomy.map((entry, index) => (
                  <div key={entry.id ?? index} className="rounded-lg border p-3 bg-muted/30">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="font-medium">
                        {entry.display || entry.id || 'Ingredient'}
                      </span>
                      {entry.source && (
                        <Badge variant="secondary">{entry.source}</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      {entry.parents && entry.parents.length > 0 && (
                        <div>
                          <strong>Parents:</strong> {entry.parents.slice(0, 3).join(' › ')}
                        </div>
                      )}
                      {entry.synonyms && entry.synonyms.length > 0 && (
                        <div>
                          <strong>Synonyms:</strong> {entry.synonyms.slice(0, 6).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(analysis.taxonomyError || analysis.additivesError) && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="space-y-1 text-sm">
                <div>Some taxonomy information could not be loaded.</div>
                {analysis.taxonomyError && <div>Ingredients taxonomy: {analysis.taxonomyError}</div>}
                {analysis.additivesError && <div>Additives taxonomy: {analysis.additivesError}</div>}
              </AlertDescription>
            </Alert>
          )}

          {infoBannerShow && (
            <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800">
              <div className="flex items-center gap-2 font-medium">
                <Leaf className="h-4 w-4" />
                Powered by the Open Food Facts taxonomy
              </div>
              <p>
                CleanEats uses the community-maintained Open Food Facts database to identify potential additives, allergens,
                and dietary conflicts. Consider contributing improvements if you spot missing or inaccurate ingredient data.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
