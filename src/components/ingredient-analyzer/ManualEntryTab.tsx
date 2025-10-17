import { Textarea } from '../ui/textarea';

interface ManualEntryTabProps {
  ingredients: string;
  onIngredientsChange: (value: string) => void;
}

export function ManualEntryTab({ ingredients, onIngredientsChange }: ManualEntryTabProps) {
  return (
    <div className="space-y-4 mt-6">
      <div>
        <label htmlFor="ingredients" className="block mb-2">
          Ingredients (separate with commas)
        </label>
        <Textarea
          id="ingredients"
          placeholder="e.g., organic tomatoes, water, sea salt, basil, oregano, garlic powder"
          value={ingredients}
          onChange={(e) => onIngredientsChange(e.target.value)}
          rows={4}
          className="w-full"
        />
      </div>
    </div>
  );
}
