import type { AvoidGuideMatch } from '../data/avoidList';

export interface TaxonomyEntry {
  id?: string;
  display?: string;
  parents?: string[];
  synonyms?: string[];
  source?: string;
}

export interface AnalysisResult {
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

export interface FlaggedIngredientBadge {
  key: string;
  label: string;
  match: AvoidGuideMatch | null;
  original: string;
}
