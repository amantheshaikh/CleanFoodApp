import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Loader2, Save, Settings } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface UserPreferencesProps {
  accessToken: string | null;
}

type DietaryPreference = 'none' | 'vegetarian' | 'vegan' | 'jain';

interface Preferences {
  strictness: 'lenient' | 'moderate' | 'strict';
  allergies: string[];
  dietary_preference: DietaryPreference;
}

const commonAllergies = [
  'Gluten', 'Dairy', 'Nuts', 'Soy', 'Eggs', 'Shellfish', 'Fish', 'Sesame'
];

const dietOptions: { value: DietaryPreference; label: string; description?: string }[] = [
  { value: 'none', label: 'No dietary preference' },
  { value: 'vegetarian', label: 'Vegetarian', description: 'Exclude meat, fish, and seafood.' },
  { value: 'vegan', label: 'Vegan', description: 'Exclude all animal-derived ingredients and by-products.' },
  { value: 'jain', label: 'Jain', description: 'Exclude meat, eggs, honey, and root vegetables.' },
];

export function UserPreferences({ accessToken }: UserPreferencesProps) {
  const [preferences, setPreferences] = useState<Preferences>({
    strictness: 'moderate',
    allergies: [],
    dietary_preference: 'none',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const fetchPreferences = async () => {
    if (!accessToken) return;

    setIsLoading(true);
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5111eaf7/preferences`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (response.ok) {
        setPreferences({
          strictness: result.preferences?.strictness ?? 'moderate',
          allergies: result.preferences?.allergies ?? [],
          dietary_preference: result.preferences?.dietary_preference ?? 'none',
        });
      } else {
        setError(result.error || 'Failed to fetch preferences');
      }
    } catch (error: any) {
      console.error('Error fetching preferences:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const savePreferences = async () => {
    if (!accessToken) return;

    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5111eaf7/preferences`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(preferences)
      });

      const result = await response.json();

      if (response.ok) {
        setMessage('Preferences saved successfully!');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setError(result.error || 'Failed to save preferences');
      }
    } catch (error: any) {
      console.error('Error saving preferences:', error);
      setError(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    fetchPreferences();
  }, [accessToken]);

  const toggleAllergy = (allergy: string) => {
    setPreferences(prev => ({
      ...prev,
      allergies: prev.allergies.includes(allergy)
        ? prev.allergies.filter(a => a !== allergy)
        : [...prev.allergies, allergy]
    }));
  };

  const updateDietaryPreference = (preference: DietaryPreference) => {
    setPreferences((prev) => ({
      ...prev,
      dietary_preference: preference,
    }));
  };

  if (!accessToken) {
    return (
      <Alert>
        <AlertDescription>
          Sign in to customize your clean eating preferences and get personalized analysis.
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading preferences...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5" />
        <h3 className="text-lg">Your Preferences</h3>
      </div>

      {message && (
        <Alert>
          <AlertDescription className="text-green-600">{message}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Analysis Strictness</CardTitle>
          <CardDescription>
            How strictly should we evaluate clean eating standards?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={preferences.strictness}
            onValueChange={(value: 'lenient' | 'moderate' | 'strict') => 
              setPreferences(prev => ({ ...prev, strictness: value }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lenient">
                Lenient - Basic clean eating standards
              </SelectItem>
              <SelectItem value="moderate">
                Moderate - Standard clean eating criteria
              </SelectItem>
              <SelectItem value="strict">
                Strict - Very strict clean eating standards
              </SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Allergies & Sensitivities</CardTitle>
          <CardDescription>
            Select ingredients you're allergic to or want to avoid
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {commonAllergies.map((allergy) => (
              <div key={allergy} className="flex items-center space-x-2">
                <Checkbox
                  id={`allergy-${allergy}`}
                  checked={preferences.allergies.includes(allergy)}
                  onCheckedChange={() => toggleAllergy(allergy)}
                />
                <Label htmlFor={`allergy-${allergy}`} className="text-sm">
                  {allergy}
                </Label>
              </div>
            ))}
          </div>
          
          {preferences.allergies.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Selected allergies:</p>
              <div className="flex flex-wrap gap-2">
                {preferences.allergies.map((allergy) => (
                  <Badge key={allergy} variant="destructive">
                    {allergy}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dietary Preference</CardTitle>
          <CardDescription>
            Select one dietary guideline and we’ll flag conflicts during analysis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {dietOptions.map((option) => (
              <div key={option.value} className="flex items-start gap-3">
                <Checkbox
                  id={`diet-${option.value}`}
                  checked={preferences.dietary_preference === option.value}
                  onCheckedChange={() => updateDietaryPreference(option.value)}
                />
                <div>
                  <Label htmlFor={`diet-${option.value}`} className="font-medium">
                    {option.label}
                  </Label>
                  {option.description && (
                    <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              Selected: {dietOptions.find((option) => option.value === preferences.dietary_preference)?.label}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Button onClick={savePreferences} disabled={isSaving} className="w-full">
        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        <Save className="mr-2 h-4 w-4" />
        Save Preferences
      </Button>
    </div>
  );
}
