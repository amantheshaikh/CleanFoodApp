export type AvoidSectionId =
  | 'preservatives'
  | 'artificial'
  | 'sweeteners'
  | 'fats-oils'
  | 'emulsifiers'
  | 'flavor-enhancers';

export interface AvoidIngredient {
  slug: string;
  name: string;
  reason: string;
  synonyms: string[];
}

export interface AvoidSection {
  id: AvoidSectionId;
  title: string;
  items: AvoidIngredient[];
}

export const avoidSections: AvoidSection[] = [
  {
    id: 'preservatives',
    title: 'Preservatives & Antioxidants',
    items: [
      {
        slug: 'bha',
        name: 'BHA (Butylated Hydroxyanisole)',
        reason: 'Potential carcinogen, linked to hormone disruption',
        synonyms: ['bha', 'butylated hydroxyanisole', 'e320'],
      },
      {
        slug: 'bht',
        name: 'BHT (Butylated Hydroxytoluene)',
        reason: 'May cause liver and kidney damage, potential carcinogen',
        synonyms: ['bht', 'butylated hydroxytoluene', 'e321'],
      },
      {
        slug: 'tbhq',
        name: 'TBHQ (Tertiary Butylhydroquinone)',
        reason: 'Can cause nausea, vomiting, and behavioral changes',
        synonyms: ['tbhq', 'tb hq', 'tert-butylhydroquinone', 'e319'],
      },
      {
        slug: 'sodium-nitrites',
        name: 'Sodium Nitrites & Nitrates',
        reason: 'Can form carcinogenic nitrosamines when heated',
        synonyms: [
          'sodium nitrite',
          'sodium nitrites',
          'sodium nitrate',
          'sodium nitrates',
          'e250',
        ],
      },
      {
        slug: 'potassium-bromate',
        name: 'Potassium Bromate',
        reason: 'Banned in many countries, potential carcinogen',
        synonyms: ['potassium bromate', 'e924'],
      },
      {
        slug: 'propyl-gallate',
        name: 'Propyl Gallate',
        reason: 'May cause stomach irritation and liver problems',
        synonyms: ['propyl gallate', 'e310'],
      },
      {
        slug: 'calcium-propionate',
        name: 'Calcium Propionate',
        reason: 'Linked to behavioral issues in children',
        synonyms: ['calcium propionate', 'e282'],
      },
      {
        slug: 'sodium-benzoate',
        name: 'Sodium Benzoate',
        reason: 'Can form benzene (carcinogen) when combined with vitamin C',
        synonyms: ['sodium benzoate', 'e211'],
      },
      {
        slug: 'potassium-sorbate',
        name: 'Potassium Sorbate',
        reason: 'May trigger allergies and irritate skin, eyes, and respiratory system',
        synonyms: ['potassium sorbate', 'e202'],
      },
    ],
  },
  {
    id: 'artificial',
    title: 'Artificial Colors & Flavors',
    items: [
      {
        slug: 'artificial-colors',
        name: 'Artificial Colors',
        reason: 'Often petroleum-derived and linked to hyperactivity and allergies',
        synonyms: [
          'artificial color',
          'artificial colors',
          'artificial colour',
          'artificial colours',
          'artificial colouring',
        ],
      },
      {
        slug: 'artificial-flavors',
        name: 'Artificial Flavors',
        reason: 'Contain dozens of synthetic chemicals with no nutritional value',
        synonyms: [
          'artificial flavor',
          'artificial flavors',
          'artificial flavour',
          'artificial flavours',
          'artificial flavoring',
          'artificial flavouring',
        ],
      },
      {
        slug: 'red-dye-40',
        name: 'Red Dye 40 (Allura Red)',
        reason: 'Linked to hyperactivity in children, potential allergen',
        synonyms: ['red dye 40', 'red 40', 'allura red', 'e129'],
      },
      {
        slug: 'yellow-5',
        name: 'Yellow 5 (Tartrazine)',
        reason: 'Can cause allergic reactions and hyperactivity',
        synonyms: ['yellow 5', 'tartrazine', 'e102'],
      },
      {
        slug: 'yellow-6',
        name: 'Yellow 6 (Sunset Yellow)',
        reason: 'May cause hyperactivity and allergic reactions',
        synonyms: ['yellow 6', 'sunset yellow', 'e110'],
      },
      {
        slug: 'ponceau-4r',
        name: 'Ponceau 4R',
        reason: 'Synthetic red dye linked to hyperactivity and potential allergies',
        synonyms: ['ponceau 4r', 'e124'],
      },
      {
        slug: 'blue-1',
        name: 'Blue 1 (Brilliant Blue)',
        reason: 'May cause allergic reactions in sensitive individuals',
        synonyms: ['blue 1', 'brilliant blue', 'e133'],
      },
      {
        slug: 'blue-2',
        name: 'Blue 2 (Indigo Carmine)',
        reason: 'Linked to brain tumors in animal studies',
        synonyms: ['blue 2', 'indigo carmine', 'e132'],
      },
      {
        slug: 'green-3',
        name: 'Green 3 (Fast Green)',
        reason: 'Linked to bladder tumors in animal studies',
        synonyms: ['green 3', 'fast green', 'e143'],
      },
      {
        slug: 'artificial-vanilla',
        name: 'Artificial Vanilla (Vanillin)',
        reason: 'Often petroleum-derived, lacks nutritional benefits',
        synonyms: ['artificial vanilla', 'vanillin'],
      },
      {
        slug: 'artificial-strawberry',
        name: 'Artificial Strawberry Flavor',
        reason: 'Contains many synthetic chemicals to mimic natural flavor',
        synonyms: ['artificial strawberry', 'strawberry flavor'],
      },
    ],
  },
  {
    id: 'sweeteners',
    title: 'Artificial Sweeteners & Refined Sugars',
    items: [
      {
        slug: 'refined-sugar',
        name: 'Refined Sugar',
        reason: 'Highly processed, spikes blood sugar and lacks nutrients',
        synonyms: ['sugar', 'refined sugar', 'white sugar'],
      },
      {
        slug: 'invert-sugar',
        name: 'Invert Sugar',
        reason: 'High in simple sugars, rapidly elevates blood glucose',
        synonyms: ['invert sugar'],
      },
      {
        slug: 'glucose-syrup',
        name: 'Glucose Syrup',
        reason: 'Highly processed sweetener that spikes blood sugar',
        synonyms: ['glucose syrup'],
      },
      {
        slug: 'fructose-syrup',
        name: 'Fructose Syrup',
        reason: 'Highly refined, contributes to fatty liver and metabolic issues',
        synonyms: ['fructose syrup'],
      },
      {
        slug: 'dextrose',
        name: 'Dextrose',
        reason: 'Processed glucose that causes rapid blood sugar spikes',
        synonyms: ['dextrose'],
      },
      {
        slug: 'maltodextrin',
        name: 'Maltodextrin',
        reason: 'Highly processed additive that spikes blood sugar and disrupts gut bacteria',
        synonyms: ['maltodextrin'],
      },
      {
        slug: 'hfcs',
        name: 'High Fructose Corn Syrup',
        reason: 'Contributes to obesity, diabetes, and liver problems',
        synonyms: ['high fructose corn syrup', 'hfcs'],
      },
      {
        slug: 'corn-syrup-solids',
        name: 'Corn Syrup Solids',
        reason: 'Highly processed sweetener that rapidly raises blood sugar',
        synonyms: ['corn syrup solids'],
      },
      {
        slug: 'aspartame',
        name: 'Aspartame',
        reason: 'Linked to headaches, mood disorders, and potential cancer risk',
        synonyms: ['aspartame'],
      },
      {
        slug: 'sucralose',
        name: 'Sucralose (Splenda)',
        reason: 'May alter gut bacteria and is not fully metabolized',
        synonyms: ['sucralose'],
      },
      {
        slug: 'acesulfame-potassium',
        name: 'Acesulfame Potassium (Ace-K)',
        reason: 'Potential carcinogen with limited safety data',
        synonyms: ['acesulfame potassium', 'acesulfame k', 'acesulfame-k', 'acesulfame'],
      },
      {
        slug: 'saccharin',
        name: 'Saccharin',
        reason: 'Linked to bladder cancer in animal studies',
        synonyms: ['saccharin'],
      },
      {
        slug: 'neotame',
        name: 'Neotame',
        reason: 'Chemically similar to aspartame with limited safety data',
        synonyms: ['neotame'],
      },
    ],
  },
  {
    id: 'fats-oils',
    title: 'Unhealthy Fats & Oils',
    items: [
      {
        slug: 'palm-oil',
        name: 'Palm Oil',
        reason: 'Often highly refined and linked to deforestation and inflammation',
        synonyms: ['palm oil'],
      },
      {
        slug: 'hydrogenated-oils',
        name: 'Hydrogenated & Partially Hydrogenated Oils',
        reason: 'Contain trans fats that raise LDL cholesterol and inflammation',
        synonyms: ['hydrogenated', 'hydrogenated oil', 'partially hydrogenated', 'shortening'],
      },
      {
        slug: 'mono-diglycerides',
        name: 'Mono- and Diglycerides',
        reason: 'Often contain trans fats and are highly processed',
        synonyms: [
          'mono and diglycerides',
          'mono- and diglycerides',
          'monoglycerides',
          'diglycerides',
        ],
      },
      {
        slug: 'lecithin',
        name: 'Lecithin (Non-Organic)',
        reason: 'Often GMO-derived and may contain chemical residues',
        synonyms: ['lecithin', 'lecithins'],
      },
    ],
  },
  {
    id: 'emulsifiers',
    title: 'Emulsifiers & Stabilizers',
    items: [
      {
        slug: 'carrageenan',
        name: 'Carrageenan',
        reason: 'May cause digestive inflammation and ulcers',
        synonyms: ['carrageenan'],
      },
      {
        slug: 'polysorbate-80',
        name: 'Polysorbate 80',
        reason: 'May disrupt gut bacteria and cause inflammation',
        synonyms: ['polysorbate 80'],
      },
      {
        slug: 'propylene-glycol',
        name: 'Propylene Glycol',
        reason: 'Synthetic additive also used in antifreeze and industrial applications',
        synonyms: ['propylene glycol'],
      },
    ],
  },
  {
    id: 'flavor-enhancers',
    title: 'Flavor Enhancers',
    items: [
      {
        slug: 'msg',
        name: 'MSG (Monosodium Glutamate)',
        reason: 'Can cause headaches, flushing, and other sensitivity reactions',
        synonyms: ['msg', 'monosodium glutamate', 'e621'],
      },
    ],
  },
];

export interface AvoidGuideMatch {
  section: AvoidSectionId;
  item: AvoidIngredient;
}

export function normalizeIngredientName(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[^a-z0-9+\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const avoidLookup = new Map<string, AvoidGuideMatch>();

for (const section of avoidSections) {
  for (const item of section.items) {
    const keys = new Set<string>();
    keys.add(item.slug);
    keys.add(item.name);
    item.synonyms.forEach((syn) => keys.add(syn));

    for (const key of keys) {
      const normalized = normalizeIngredientName(key);
      if (!normalized) continue;
      if (!avoidLookup.has(normalized)) {
        avoidLookup.set(normalized, { section: section.id, item });
      }
    }
  }
}

export function findAvoidGuideMatch(name: string | undefined | null): AvoidGuideMatch | null {
  if (!name) return null;
  const normalized = normalizeIngredientName(name);
  return avoidLookup.get(normalized) ?? null;
}

export function listAllAvoidIngredients(): AvoidGuideMatch[] {
  const entries: AvoidGuideMatch[] = [];
  for (const section of avoidSections) {
    for (const item of section.items) {
      entries.push({ section: section.id, item });
    }
  }
  return entries;
}
