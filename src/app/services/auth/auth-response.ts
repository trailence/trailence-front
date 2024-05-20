import { Preferences } from '../preferences/preferences';

export interface AuthResponse {

  accessToken: string;
  expires: number;
  email: string;
  preferences: Preferences;

}
