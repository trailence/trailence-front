import { Preferences } from '../preferences/preferences';

export interface AuthResponse {

  accessToken: string;
  expires: number;
  email: string;
  keyId: string;
  keyCreatedAt: number;
  keyExpiresAt: number;
  preferences: Preferences;
  complete: boolean;
  admin: boolean;

}
