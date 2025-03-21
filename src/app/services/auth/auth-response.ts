import { Preferences } from '../preferences/preferences';
import { UserQuotas } from './user-quotas';

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
  quotas: UserQuotas;
  allowedExtensions: string[];

}
