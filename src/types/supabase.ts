export interface PreferencesPayload {
  allergies?: string[];
  dietary_preference?: 'none' | 'vegetarian' | 'vegan' | 'jain';
}

export interface PreferencesResponse {
  preferences?: PreferencesPayload;
}
