import { Platform } from '@ionic/angular/standalone';
import { trailenceAppVersionCode, trailenceAppVersionName } from 'src/app/trailence-version';

export class DeviceInfo {

  public userAgent: string;
  public mobile: boolean;
  public platform: string;
  public brands: BrandVersion[];
  public ionPlatforms: string[];
  public versionName: string;
  public versionCode: number;

  constructor(ionic: Platform) {
    this.userAgent = window.navigator.userAgent;
    const uaData = (window.navigator as any).userAgentData;
    if (uaData) {
      this.mobile = uaData.mobile || false;
      this.platform = uaData.platform || '';
      this.brands = (uaData.brands || []).map((b: any) => ({brand: b.brand, version: b.version}));
    } else {
      this.mobile = false;
      this.platform = '';
      this.brands = [];
    }
    this.ionPlatforms = ionic.platforms();
    this.versionName = trailenceAppVersionName;
    this.versionCode = trailenceAppVersionCode;
  }

}

export interface BrandVersion {

  brand: string;
  version: string;

}
