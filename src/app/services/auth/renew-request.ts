import { DeviceInfo } from './device-info';

export interface RenewRequest {
  email: string;
  random: string;
  keyId: string;
  signature: string;
  deviceInfo: DeviceInfo;
}
