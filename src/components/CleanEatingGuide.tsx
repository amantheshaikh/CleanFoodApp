import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Alert, AlertDescription } from './ui/alert';
import { Separator } from './ui/separator';
import { 
  CheckCircle, 
  XCircle, 
  Info, 
  AlertTriangle, 
  Leaf, 
  Heart, 
  Brain,
  Shield,
  Calendar,
  ShoppingCart,
  BookOpen,
  Users
} from 'lucide-react';
import { avoidSections, type AvoidSectionId } from '../data/avoidList';
import { cn } from './ui/utils';

type GuideTab = 'avoid' | 'choose' | 'labels' | 'shopping' | 'seasonal' | 'tips';

const guideTabs: { value: GuideTab; label: string }[] = [
  { value: 'avoid', label: 'Avoid' },
  { value: 'choose', label: 'Choose' },
  { value: 'labels', label: 'Labels' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'seasonal', label: 'Seasonal' },
  { value: 'tips', label: 'Tips' },
];

interface CleanEatingGuideProps {
  focusedIngredient?: {
    section: AvoidSectionId;
    slug: string;
    name: string;
  } | null;
  onClearFocus?: () => void;
}

export function CleanEatingGuide({ focusedIngredient, onClearFocus }: CleanEatingGuideProps) {
  const [activeTab, setActiveTab] = useState<GuideTab>('avoid');
  const [openSection, setOpenSection] = useState<AvoidSectionId | undefined>(avoidSections[0]?.id);
  const [highlightedSlug, setHighlightedSlug] = useState<string | null>(null);

  const activeTabIndex = Math.max(
    0,
    guideTabs.findIndex((tab) => tab.value === activeTab),
  );

  const activateTab = useCallback(
    (value: GuideTab) => {
      setActiveTab(value);
      window.requestAnimationFrame(() => {
        const target = document.getElementById(`guide-tab-${value}`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      });
    },
    [],
  );

  const renderTabContent = (tab: GuideTab) => {
    switch (tab) {
      case 'avoid':
        return (
          <div className="space-y-6">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                These ingredients are commonly found in processed foods and should be avoided or limited
                for optimal health. Many have been linked to various health concerns in scientific studies.
              </AlertDescription>
            </Alert>

            <Accordion
              type="single"
              collapsible
              className="w-full"
              value={openSection}
              onValueChange={(value) => setOpenSection((value as AvoidSectionId) || undefined)}
            >
              {avoidSections.map((section) => (
                <AccordionItem key={section.id} value={section.id}>
                  <AccordionTrigger className="text-red-600">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5" />
                      {section.title} ({section.items.length})
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      {section.items.map((item) => (
                        <div
                          key={item.slug}
                          id={`guide-ingredient-${item.slug}`}
                          className={cn(
                            'border-l-2 border-red-200 pl-4 transition-colors duration-300',
                            highlightedSlug === item.slug &&
                              'border-red-400 bg-red-50/80 shadow-sm rounded-md',
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium">{item.name}</p>
                              <p className="text-sm text-muted-foreground">{item.reason}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        );

      case 'choose':
        return (
          <div className="space-y-6">
            <Alert>
              <Heart className="h-4 w-4" />
              <AlertDescription>
                These clean, whole food ingredients provide optimal nutrition and align with clean eating principles.
                Choose organic when possible and prioritize minimally processed options.
              </AlertDescription>
            </Alert>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    Clean Proteins
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {cleanProteins.map((item, index) => (
                      <div key={index} className="border-l-2 border-green-200 pl-4">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-sm text-muted-foreground">{item.benefits}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    Clean Carbohydrates
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {cleanCarbohydrates.map((item, index) => (
                      <div key={index} className="border-l-2 border-green-200 pl-4">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-sm text-muted-foreground">{item.benefits}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    Clean Fats & Oils
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {cleanFats.map((item, index) => (
                      <div key={index} className="border-l-2 border-green-200 pl-4">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-sm text-muted-foreground">{item.benefits}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    Natural Sweeteners
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {cleanSweeteners.map((item, index) => (
                      <div key={index} className="border-l-2 border-green-200 pl-4">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-sm text-muted-foreground">{item.benefits}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case 'labels':
        return (
          <div className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Reading labels carefully helps you avoid hidden additives, sugars, and marketing traps.
                Focus on short, recognizable ingredient lists and minimal processing.
              </AlertDescription>
            </Alert>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-blue-500" />
                    How to Read Ingredient Lists
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  {labelChecklist.map((item, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 flex-shrink-0">
                        {index + 1}
                      </Badge>
                      <span>{item}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-blue-500" />
                    Common Marketing Red Flags
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {marketingClaims.map((item, index) => (
                    <div key={index} className="rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-sm text-blue-900">
                      <p className="font-medium">{item.claim}</p>
                      <p>{item.reality}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case 'shopping':
        return (
          <div className="space-y-6">
            <Alert>
              <ShoppingCart className="h-4 w-4" />
              <AlertDescription>
                Smart shopping habits make clean eating easier and more affordable. Focus on planning, reading labels,
                and choosing high-quality ingredients.
              </AlertDescription>
            </Alert>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Leaf className="h-5 w-5 text-green-500" />
                    Clean Shopping Checklist
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  {shoppingTips.map((tip, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 flex-shrink-0">
                        {index + 1}
                      </Badge>
                      <span>{tip}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-purple-500" />
                    Smart Meal Prep Strategies
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  {mealPrepTips.map((tip, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 flex-shrink-0">
                        {index + 1}
                      </Badge>
                      <span>{tip}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case 'seasonal':
        return (
          <div className="space-y-6">
            <Alert>
              <Calendar className="h-4 w-4" />
              <AlertDescription>
                Eating with the seasons ensures maximum freshness and nutrient density while supporting local farmers.
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Leaf className="h-5 w-5 text-emerald-500" />
                  Seasonal Eating Guide
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {seasonalEating.map((item) => (
                  <div key={item.season} className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-4">
                    <p className="font-semibold text-emerald-700">{item.season}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.foods}</p>
                    <Separator className="my-3" />
                    <p className="text-sm text-emerald-800">{item.benefits}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        );

      case 'tips':
      default:
        return (
          <div className="space-y-6">
            <Alert>
              <Brain className="h-4 w-4" />
              <AlertDescription>
                Avoid common pitfalls and build lasting clean eating habits with these key lessons.
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-indigo-500" />
                  Clean Eating Wisdom
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {commonMistakes.map((item, index) => (
                  <div key={index} className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-3">
                    <p className="font-medium text-indigo-700">{item.mistake}</p>
                    <p>{item.explanation}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        );
    }
  };

  useEffect(() => {
    if (!focusedIngredient) return;

    activateTab('avoid');
    const targetSection =
      avoidSections.find((section) => section.id === focusedIngredient.section)?.id ??
      avoidSections[0]?.id;
    setOpenSection(targetSection);
    setHighlightedSlug(focusedIngredient.slug);

    const scrollTimer = window.setTimeout(() => {
      const element = document.getElementById(`guide-ingredient-${focusedIngredient.slug}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);

    const clearTimer = window.setTimeout(() => {
      setHighlightedSlug(null);
      onClearFocus?.();
    }, 4000);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [activateTab, focusedIngredient, onClearFocus]);

  const cleanProteins = [
    { name: 'Grass-fed Beef', benefits: 'Higher omega-3s, no antibiotics or hormones' },
    { name: 'Wild-caught Fish', benefits: 'Rich in omega-3s, lower toxin levels' },
    { name: 'Pastured Poultry', benefits: 'Higher nutrient density, humane treatment' },
    { name: 'Organic Eggs', benefits: 'From hens with outdoor access, no antibiotics' },
    { name: 'Hemp Seeds', benefits: 'Complete protein, rich in healthy fats' },
    { name: 'Spirulina', benefits: 'Highly bioavailable protein, rich in minerals' },
    { name: 'Organic Legumes', benefits: 'High fiber, sustainable protein source' },
    { name: 'Raw Nuts & Seeds', benefits: 'Healthy fats, minerals, not heat-processed' }
  ];

  const cleanCarbohydrates = [
    { name: 'Quinoa', benefits: 'Complete protein, gluten-free, high fiber' },
    { name: 'Sweet Potatoes', benefits: 'Rich in beta-carotene, fiber, potassium' },
    { name: 'Steel-cut Oats', benefits: 'Lower glycemic index, minimally processed' },
    { name: 'Brown Rice', benefits: 'Whole grain, good source of manganese' },
    { name: 'Buckwheat', benefits: 'Gluten-free, high in rutin (antioxidant)' },
    { name: 'Millet', benefits: 'Alkalizing, rich in magnesium' },
    { name: 'Wild Rice', benefits: 'High in antioxidants, more protein than brown rice' },
    { name: 'Plantains', benefits: 'Rich in potassium, resistant starch when green' }
  ];

  const cleanFats = [
    { name: 'Extra Virgin Olive Oil', benefits: 'Rich in antioxidants, anti-inflammatory' },
    { name: 'Coconut Oil (Unrefined)', benefits: 'Medium-chain triglycerides, stable for cooking' },
    { name: 'Avocado Oil', benefits: 'High smoke point, heart-healthy monounsaturated fats' },
    { name: 'Grass-fed Butter', benefits: 'Rich in vitamin K2, CLA, fat-soluble vitamins' },
    { name: 'MCT Oil', benefits: 'Rapidly absorbed, supports brain function' },
    { name: 'Walnut Oil', benefits: 'High in omega-3 ALA, best used cold' },
    { name: 'Macadamia Oil', benefits: 'High in monounsaturated fats, stable' },
    { name: 'Ghee', benefits: 'Lactose-free, high smoke point, rich flavor' }
  ];

  const cleanSweeteners = [
    { name: 'Raw Honey', benefits: 'Contains enzymes, antioxidants, antimicrobial properties' },
    { name: 'Pure Maple Syrup', benefits: 'Rich in manganese and zinc, less processed' },
    { name: 'Coconut Sugar', benefits: 'Contains some minerals, lower glycemic index' },
    { name: 'Dates', benefits: 'Whole food, high in fiber, potassium, antioxidants' },
    { name: 'Stevia (whole leaf)', benefits: 'Natural, zero calories, doesn\'t spike blood sugar' },
    { name: 'Monk Fruit', benefits: 'Natural, zero calories, antioxidant properties' },
    { name: 'Blackstrap Molasses', benefits: 'Rich in iron, calcium, potassium' }
  ];

  const shoppingTips = [
    'Shop the perimeter of the grocery store where fresh, whole foods are located',
    'Read ingredient lists, not just nutrition facts - ingredients are listed by quantity',
    'If there are more than 5-7 ingredients, be cautious and read carefully',
    'Avoid products where sugar is one of the first 3 ingredients',
    'Look for minimal processing - the closer to its natural state, the better',
    'Choose organic for the "Dirty Dozen" fruits and vegetables',
    'Buy seasonal and local when possible for maximum freshness and nutrition',
    'Frozen can be better than fresh if it\'s been frozen at peak ripeness',
    'Check expiration dates and choose the freshest options available',
    'Avoid foods with marketing claims like "natural" - focus on actual ingredients'
  ];

  const mealPrepTips = [
    'Batch cook grains and proteins at the beginning of each week',
    'Wash and prep vegetables immediately after shopping',
    'Use glass containers for storing prepped foods to avoid plastic chemicals',
    'Prepare healthy snacks in advance to avoid processed options',
    'Make large batches of soups, stews, and casseroles for easy reheating',
    'Keep emergency clean foods on hand: nuts, seeds, canned fish, frozen vegetables',
    'Prepare smoothie ingredients in freezer bags for quick morning blends',
    'Cook extra portions at dinner to have leftovers for lunch'
  ];

  const labelChecklist = [
    'Start with the serving size and servings per container',
    'Scan the ingredient list from top to bottom – ingredients are listed by quantity',
    'Watch for ultra-processed additives, dyes, artificial flavours, and preservatives',
    'Beware of sneaky sugars listed under different names (maltodextrin, HFCS, etc.)',
    'Prefer products with five to seven ingredients or fewer',
    'Skip items where the first ingredients are sugars, refined flours, or oils',
    'Check for certifications that align with your values (organic, non-GMO)',
  ];

  const marketingClaims = [
    {
      claim: '“Natural” or “made with natural flavours”',
      reality: 'Often means synthetic flavour compounds derived from natural sources; not necessarily healthy.',
    },
    {
      claim: '“Sugar-free” or “No added sugar”',
      reality: 'May rely on artificial sweeteners or sugar alcohols that still impact digestion and cravings.',
    },
    {
      claim: '“Multigrain” or “Made with whole grains”',
      reality: 'Usually a mix of refined flours with a small amount of whole grain added for marketing.',
    },
    {
      claim: '“Fat-free” or “Low-fat”',
      reality: 'Often replaces fat with extra sugar, stabilizers, and flavourings to maintain taste.',
    },
    {
      claim: '“Immune boosting”, “Keto-friendly”, or similar buzzwords',
      reality: 'These are unregulated claims – always read the ingredient list to verify.',
    },
  ];

  const seasonalEating = [
    {
      season: 'Spring',
      foods: 'Asparagus, artichokes, spring onions, strawberries, apricots, leafy greens',
      benefits: 'Natural detox foods help cleanse after winter, lighter foods for increasing activity'
    },
    {
      season: 'Summer',
      foods: 'Tomatoes, cucumbers, berries, stone fruits, zucchini, bell peppers',
      benefits: 'High water content foods for hydration, cooling foods for hot weather'
    },
    {
      season: 'Fall',
      foods: 'Squash, pumpkins, apples, pears, root vegetables, nuts',
      benefits: 'Grounding foods with healthy fats and complex carbs for energy storage'
    },
    {
      season: 'Winter',
      foods: 'Citrus fruits, cruciferous vegetables, stored grains, warming spices',
      benefits: 'Immune-supporting foods, warming foods for cold weather'
    }
  ];

  const commonMistakes = [
    {
      mistake: 'Thinking "natural" means healthy',
      explanation: 'Natural flavors can be highly processed and contain dozens of chemicals'
    },
    {
      mistake: 'Ignoring serving sizes',
      explanation: 'Even clean foods should be consumed in appropriate portions'
    },
    {
      mistake: 'Not reading ingredient lists completely',
      explanation: 'Harmful ingredients are often hidden in the middle or end of lists'
    },
    {
      mistake: 'Assuming organic is always clean',
      explanation: 'Organic products can still contain processed ingredients and sugars'
    },
    {
      mistake: 'Replacing whole foods with "clean" packaged foods',
      explanation: 'Whole, unprocessed foods are always preferable to packaged alternatives'
    },
    {
      mistake: 'Not considering food combinations',
      explanation: 'Some nutrients are better absorbed when eaten together'
    },
    {
      mistake: 'Forgetting about food storage',
      explanation: 'Improper storage can lead to nutrient loss and contamination'
    }
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Leaf className="h-6 w-6 text-green-500" />
            Complete Guide to Clean Eating
          </CardTitle>
          <CardDescription>
            A comprehensive resource for understanding clean eating principles, identifying ingredients, 
            and making informed food choices for optimal health and nutrition.
          </CardDescription>
        </CardHeader>
      </Card>

      <section className="space-y-6">
        <div className="grid w-full gap-2 rounded-xl bg-muted p-1 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {guideTabs.map((tab) => {
            const isActive = activeTab === tab.value;
            return (
              <button
                key={`tab-${tab.value}`}
                id={`guide-tab-${tab.value}`}
                type="button"
                onClick={() => activateTab(tab.value)}
                className={cn(
                  'flex h-10 items-center justify-center rounded-lg px-3 text-sm font-medium transition text-center',
                  isActive
                    ? 'bg-card text-foreground shadow-sm'
                    : 'bg-transparent text-muted-foreground hover:text-foreground/80',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {renderTabContent(activeTab)}
      </section>
    </div>
  );
}
