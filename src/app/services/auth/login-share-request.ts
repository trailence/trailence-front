import { DeviceInfo } from './device-info';

export interface LoginShareRequest {
  token: string;
  publicKey: string;
  deviceInfo: DeviceInfo;
}
