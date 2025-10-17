import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { CheckCircle, XCircle, AlertTriangle, Camera, Scan, Type, Leaf, Loader2 } from 'lucide-react';
import { supabase } from '../utils/supabase/client';
import { projectId } from '../utils/supabase/info';
import { getAuthHeaders } from '../utils/supabase/auth';
import { findAvoidGuideMatch, type AvoidGuideMatch } from '../data/avoidList';
import { cn } from './ui/utils';
import type { AnalysisResult, FlaggedIngredientBadge, TaxonomyEntry } from '../types/analysis';
import { ManualEntryTab } from './ingredient-analyzer/ManualEntryTab';
import { toast } from 'sonner@2.0.3';

const BarcodeScannerSection = lazy(() =>
  import('./ingredient-analyzer/BarcodeScannerSection').then((module) => ({
    default: module.BarcodeScannerSection,
  }))
);

const OcrCaptureSection = lazy(() =>
  import('./ingredient-analyzer/OcrCaptureSection').then((module) => ({
    default: module.OcrCaptureSection,
  }))
);

type AnalyzerTab = 'barcode' | 'ocr' | 'text';

interface IngredientAnalyzerProps {
  accessToken?: string | null;
  onNavigateToGuide?: (payload: {
    section: AvoidGuideMatch['section'];
    slug: string;
    name: string;
  }) => void;
}

const dietLabels: Record<string, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  jain: 'Jain',
};

const getDietLabel = (value?: string | null): string | null => {
  if (!value || value === 'none') return null;
  return dietLabels[value] || value;
};

const formatIngredientLabel = (value: string): string => {
  if (!value) return value;
  const normalized = value.trim();
  if (!normalized.includes(' ') && normalized.length <= 5) {
    return normalized.toUpperCase();
  }
  return normalized
    .split(/\s+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
};

export function IngredientAnalyzer({ accessToken, onNavigateToGuide }: IngredientAnalyzerProps) {
  const [ingredientsByTab, setIngredientsByTab] = useState<Record<AnalyzerTab, string>>({
    barcode: '',
    ocr: '',
    text: '',
  });
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<AnalyzerTab>('barcode');
  const [isAddProductFormVisible, setAddProductFormVisible] = useState(false);

  const [dietPreference, setDietPreference] = useState<'none' | 'vegetarian' | 'vegan' | 'jain'>('none');
  const [trackedAllergies, setTrackedAllergies] = useState<string[]>([]);

  const ingredients = useMemo(() => ingredientsByTab[activeTab], [ingredientsByTab, activeTab]);

  const setIngredientsForTab = useCallback(
    (value: string, tab?: AnalyzerTab) => {
      const targetTab = tab ?? activeTab;
      setIngredientsByTab((prev) => {
        if (prev[targetTab] === value) return prev;
        return { ...prev, [targetTab]: value };
      });
    },
    [activeTab]
  );
  useEffect(() => {
    if (!accessToken) {
      setDietPreference('none');
      return;
    }

    let active = true;
    const controller = new AbortController();

    const fetchPreferences = async () => {
      try {
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5111eaf7/preferences`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        const pref = data?.preferences?.dietary_preference;
        if (typeof pref === 'string' && ['none', 'vegetarian', 'vegan', 'jain'].includes(pref)) {
          setDietPreference(pref as 'none' | 'vegetarian' | 'vegan' | 'jain');
        }
        const allergiesPayload = data?.preferences?.allergies;
        if (Array.isArray(allergiesPayload)) {
          const normalized = allergiesPayload
            .filter((entry: unknown): entry is string => typeof entry === 'string' && entry.trim().length > 0);
          setTrackedAllergies(normalized);
        } else {
          setTrackedAllergies([]);
        }
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return;
        console.debug('Unable to load user preferences', err);
      }
    };

    fetchPreferences();

    return () => {
      active = false;
      controller.abort();
    };
  }, [accessToken]);

  const analysisPreferences = useMemo(() => {
    const preferencePayload: Record<string, unknown> = {};

    if (dietPreference && dietPreference !== 'none') {
      preferencePayload.diet = dietPreference;
    }

    const cleanedAllergies = Array.from(
      new Set(
        trackedAllergies
          .map((entry) => entry?.toString().trim())
          .filter((entry): entry is string => Boolean(entry))
      )
    );

    if (cleanedAllergies.length > 0) {
      preferencePayload.allergies = cleanedAllergies;
    }

    const preferenceString = Object.keys(preferencePayload).length > 0
      ? JSON.stringify(preferencePayload)
      : null;

    return {
      preferenceString,
    };
  }, [dietPreference, trackedAllergies]);

  const buildAnalysisParams = useCallback((text: string) => {
    const params = new URLSearchParams();
    params.set('ingredients', text);
    if (analysisPreferences.preferenceString) {
      params.set('preferences', analysisPreferences.preferenceString);
    }
    return params;
  }, [analysisPreferences]);

  const performAnalysis = useCallback(async (text: string): Promise<AnalysisResult> => {
    const params = buildAnalysisParams(text);

    const apiBaseRaw = import.meta.env.VITE_API_BASE as string | undefined;
    const normalizedBase = apiBaseRaw ? apiBaseRaw.trim().replace(/\/?$/, '') : '';
    const endpoint = normalizedBase ? `${normalizedBase}/check` : '/check';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Accept': 'application/json',
        'X-Requested-With': 'fetch',
      },
      body: params.toString(),
    });

    const textPayload = await response.text();
    if (!response.ok) {
      let message = 'Analysis failed';
      try {
        const err = textPayload ? JSON.parse(textPayload) : {};
        if (err && err.error) message = err.error;
      } catch (err) {
        console.error('Failed to parse error payload', err);
      }
      throw new Error(message);
    }

    const data = textPayload ? JSON.parse(textPayload) : {};
    const apiAnalysis = data.analysis || {};

    const hits = Array.from(new Set([...(apiAnalysis.hits ?? []), ...(data.hits ?? [])]));
    const taxonomyEntries: TaxonomyEntry[] = (apiAnalysis.taxonomy ?? data.taxonomy ?? []).filter(Boolean);
    const dietHits = Array.isArray(apiAnalysis.diet_hits)
      ? apiAnalysis.diet_hits
      : Array.isArray(data.diet_hits)
        ? data.diet_hits
        : [];
    const dietPref = apiAnalysis.diet_preference ?? data.diet_preference ?? null;
    const allergyHits = Array.isArray(apiAnalysis.allergy_hits)
      ? apiAnalysis.allergy_hits
      : Array.isArray(data.allergy_hits)
        ? data.allergy_hits
        : [];
    const allergyPrefs = Array.isArray(apiAnalysis.allergy_preferences)
      ? apiAnalysis.allergy_preferences
      : Array.isArray(data.allergy_preferences)
        ? data.allergy_preferences
        : [];

    return {
      isClean: Boolean(data.is_clean ?? apiAnalysis.is_clean ?? false),
      hits,
      parsedIngredients: apiAnalysis.ingredients ?? data.ingredients ?? [],
      canonical: apiAnalysis.canonical ?? data.canonical ?? [],
      taxonomy: taxonomyEntries,
      source: apiAnalysis.source ?? data.source ?? 'unknown',
      html: data.html,
      taxonomyError: apiAnalysis.taxonomy_error ?? data.taxonomy_error ?? null,
      additivesError: apiAnalysis.additives_error ?? data.additives_error ?? null,
      dietHits,
      dietPreference: dietPref,
      allergyHits,
      allergyPreferences: allergyPrefs,
    };
  }, [buildAnalysisParams]);

  const saveAnalysis = useCallback(async (text: string, analysisResult: AnalysisResult) => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5111eaf7/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(accessToken),
        },
        body: JSON.stringify({
          ingredients: text,
          analysis: analysisResult,
        }),
      });

      if (!response.ok) {
        console.error('Failed to save analysis');
      }
    } catch (error) {
      console.error('Error saving analysis:', error);
    }
  }, [accessToken]);

  const analyzeAndSave = useCallback(async (text: string) => {
    setAnalysis(null);
    setIsAnalyzing(true);

    try {
      const analysisResult = await performAnalysis(text);
      setAnalysis(analysisResult);
      await saveAnalysis(text, analysisResult);
      return analysisResult;
    } finally {
      setIsAnalyzing(false);
    }
  }, [performAnalysis, saveAnalysis]);

  const analyzeIngredients = async () => {
    const text = ingredients.trim();
    if (!text) {
      toast.error('Please enter some ingredients to analyze.');
      return;
    }

    try {
      await analyzeAndSave(text);
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast.error(error?.message || 'Failed to analyze ingredients. Please try again.');
    }
  };

  const flaggedMatches = useMemo<FlaggedIngredientBadge[]>(() => {
    if (!analysis?.hits?.length) {
      return [];
    }

    return analysis.hits.map((hit) => {
      const match = findAvoidGuideMatch(hit);
      return {
        key: match?.item.slug ?? hit,
        label: match?.item.name ?? formatIngredientLabel(hit),
        match,
        original: hit,
      };
    });
  }, [analysis]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ingredient Analysis</CardTitle>
          <CardDescription>
            Choose how you'd like to input your food's ingredient list
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              const nextTab = value as AnalyzerTab;
              setActiveTab(nextTab);
              if (nextTab !== 'barcode') {
                setAddProductFormVisible(false);
              }
            }}
            className="w-full"
          >
            <TabsList className="flex w-full flex-col gap-2 h-auto sm:h-9 sm:flex-row sm:gap-0">
              <TabsTrigger
                value="barcode"
                className="flex w-full items-center justify-center gap-2 text-sm sm:text-base"
              >
                <Scan className="h-4 w-4" />
                Scan Barcode
              </TabsTrigger>
              <TabsTrigger
                value="ocr"
                className="flex w-full items-center justify-center gap-2 text-sm sm:text-base"
              >
                <Camera className="h-4 w-4" />
                Scan Ingredients
              </TabsTrigger>
              <TabsTrigger
                value="text"
                className="flex w-full items-center justify-center gap-2 text-sm sm:text-base"
              >
                <Type className="h-4 w-4" />
                Type Ingredients
              </TabsTrigger>
            </TabsList>

            <TabsContent value="barcode" className="mt-6">
              {activeTab === 'barcode' ? (
                <Suspense
                  fallback={
                    <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Loading barcode scanner...
                    </div>
                  }
                >
                  <BarcodeScannerSection
                    ingredients={ingredientsByTab.barcode}
                    onIngredientsChange={(value) => setIngredientsForTab(value, 'barcode')}
                    onAnalysisRequest={analyzeAndSave}
                    onAddProductFormChange={setAddProductFormVisible}
                  />
                </Suspense>
              ) : null}
            </TabsContent>

            <TabsContent value="ocr" className="mt-6">
              {activeTab === 'ocr' ? (
                <Suspense
                  fallback={
                    <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Loading OCR tools...
                    </div>
                  }
                >
                  <OcrCaptureSection
                    ingredients={ingredientsByTab.ocr}
                    onIngredientsChange={(value) => setIngredientsForTab(value, 'ocr')}
                  />
                </Suspense>
              ) : null}
            </TabsContent>

            <TabsContent value="text" className="mt-6">
              <ManualEntryTab
                ingredients={ingredientsByTab.text}
                onIngredientsChange={(value) => setIngredientsForTab(value, 'text')}
              />
            </TabsContent>
          </Tabs>
          
          {!isAddProductFormVisible && (
            <div className="mt-6">
              <Button 
                onClick={analyzeIngredients}
                disabled={!ingredients.trim() || isAnalyzing}
                className="w-full"
              >
                {isAnalyzing ? 'Analyzing...' : 'Analyze Ingredients'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {analysis && (() => {
        const dietLabel = getDietLabel(analysis.dietPreference);
        const hasDietConflict = Boolean(dietLabel && analysis.dietHits && analysis.dietHits.length > 0);
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
        const dietReason = analysis.dietHits && analysis.dietHits.length > 0
          ? analysis.dietHits.join(', ')
          : null;
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
        const Icon = cardStatus === 'notClean' ? XCircle : cardStatus === 'preferenceConflict' ? AlertTriangle : CheckCircle;
        const iconColor =
          cardStatus === 'notClean'
            ? 'rgb(220 38 38)' // tailwind red-600
            : cardStatus === 'preferenceConflict'
              ? 'rgb(217 119 6)' // tailwind amber-600
              : 'rgb(22 163 74)'; // tailwind green-600
        return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-3xl sm:text-4xl font-extrabold">
              <Icon className="h-7 w-7" style={{ color: iconColor }} />
              {title}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-6">
            {flaggedMatches.length > 0 && (
              <div>
                <h4 className="mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Flagged Ingredients
                </h4>
                <div className="flex flex-wrap gap-2">
                  {flaggedMatches.map(({ key, label, match }, index) => {
                    const badgeKey = `${key}-${index}`;
                    const isClickable = Boolean(match && onNavigateToGuide);

                    if (isClickable && match) {
                      return (
                        <Badge
                          key={badgeKey}
                          variant="destructive"
                          className={cn('select-none cursor-pointer')}
                          asChild
                        >
                          <button
                            type="button"
                            onClick={() =>
                              onNavigateToGuide?.({
                                section: match.section,
                                slug: match.item.slug,
                                name: match.item.name,
                              })
                            }
                            className="inline-flex items-center gap-1"
                            aria-label={`View ${match.item.name} in the clean eating guide`}
                          >
                            {label}
                          </button>
                        </Badge>
                      );
                    }

                    return (
                      <Badge key={badgeKey} variant="destructive" className="select-none">
                        {label}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}


            {analysis.dietPreference && analysis.dietPreference !== 'none' && (
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-amber-600">
                  <Leaf className="h-4 w-4" />
                  {dietLabels[analysis.dietPreference] || 'Dietary preference'}
                </h4>
                {analysis.dietHits && analysis.dietHits.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
                    <p className="font-medium mb-2">This product conflicts with your preference:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {analysis.dietHits.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
                    Matches your {dietLabels[analysis.dietPreference] || analysis.dietPreference} preference.
                  </div>
                )}
              </div>
            )}

            {selectedAllergies.length > 0 && (
              <div>
                <h4 className={`mb-2 flex items-center gap-2 ${allergyHeaderClass}`}>
                  <AllergyHeaderIcon className="h-4 w-4" />
                  Allergies & Sensitivities
                </h4>
                {hasAllergyConflict ? (
                  <div className="rounded-lg border border-red-200 bg-red-50/70 p-4 text-sm text-red-900">
                    <p className="font-medium mb-2">
                      Matches your allergy list{uniqueAllergies.length ? ` (${uniqueAllergies.join(', ')})` : ''}:
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      {allergyHits.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
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
          </CardContent>
        </Card>
        );
      })()}

    </div>
  );
}
