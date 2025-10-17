import { publicAnonKey } from './info';

export function getAuthHeaders(accessToken?: string | null): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken ?? publicAnonKey}`,
  };
}
