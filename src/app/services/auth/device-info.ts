import { Platform } from '@ionic/angular/standalone';
import { trailenceAppVersionCode, trailenceAppVersionName } from 'src/app/trailence-version';

const DEVICE_ID_KEY = "device_id";

export class DeviceInfo {

  public userAgent: string;
  public mobile: boolean;
  public platform: string;
  public brands: BrandVersion[];
  public ionPlatforms: string[];
  public versionName: string;
  public versionCode: number;
  public deviceId: string;

  constructor(ionic: Platform) {
    this.userAgent = window.navigator.userAgent;
    const uaData = (window.navigator as any).userAgentData;
    if (uaData) {
      this.mobile = uaData.mobile ?? false;
      this.platform = uaData.platform ?? '';
      this.brands = (uaData.brands ?? []).map((b: any) => ({brand: b.brand, version: b.version}));
    } else {
      this.mobile = false;
      this.platform = '';
      this.brands = [];
    }
    this.ionPlatforms = ionic.platforms();
    this.versionName = trailenceAppVersionName;
    this.versionCode = trailenceAppVersionCode;
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (deviceId && !/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(deviceId)) deviceId = null;
    if (!deviceId) {
      deviceId = window.crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    this.deviceId = deviceId;
  }

}

export interface BrandVersion {

  brand: string;
  version: string;

}
