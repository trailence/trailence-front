import { DeviceInfo } from './device-info';

export interface LoginRequest {
  email: string;
  password: string;
  publicKey: string;
  deviceInfo: DeviceInfo;
  captchaToken?: string;
  expiresAfter?: number;
}
