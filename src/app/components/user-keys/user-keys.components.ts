import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { IonIcon, IonButton } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { StringUtils } from 'src/app/utils/string-utils';

export interface UserKey {
  id: string;
  createdAt: number;
  lastUsage: number;
  deviceInfo: any;
}

@Component({
  selector: 'app-user-keys',
  templateUrl: './user-keys.components.html',
  styleUrl: './user-keys.components.scss',
  imports: [
    CommonModule,
    IonIcon, IonButton,
  ]
})
export class UserKeysComponent implements OnInit {

  @Input() keysProvider!: () => Observable<UserKey[]>;
  @Input() keyDelete?: (id: string) => Observable<any>;

  keys?: KeyDescription[];

  constructor(
    public readonly i18n: I18nService,
    private readonly auth: AuthService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.refreshKeys();
  }

  refreshKeys(): void {
    this.keys = undefined;
    this.keysProvider().subscribe(keys => {
      this.keys = keys.map(k => this.keyDescription(k));
      this.keys.sort((k1, k2) => k2.lastUsage - k1.lastUsage);
      this.changeDetector.detectChanges();
    });
  }

  private keyDescription(key: UserKey): KeyDescription {
    const native = this.isNative(key);
    const deviceType = this.getDeviceType(key);
    const system = this.getDeviceSystem(key);
    const browser = native ? undefined : this.getBrowserBrand(key);
    const deviceDescription = this.getDeviceDescription(key);
    const appVersion = this.getAppVersion(key);
    return {
      id: key.id,
      createdAt: key.createdAt,
      lastUsage: key.lastUsage,
      native,
      deviceType,
      system,
      browser,
      deviceDescription,
      appVersion,
    };
  }

  private isNative(key: UserKey): boolean {
    const platforms = key.deviceInfo.ionPlatforms as string[];
    if (platforms) {
      if (platforms.indexOf('capacitor') >= 0) return true;
    }
    return false;
  }

  private getDeviceType(key: UserKey): DeviceType | undefined {
    const platforms = key.deviceInfo.ionPlatforms as string[];
    if (platforms) {
      if (platforms.indexOf('desktop') >= 0) return 'desktop';
      if (platforms.indexOf('mobile') >= 0) return 'mobile';
    }
    if (key.deviceInfo?.mobile) return 'mobile';
    return undefined;
  }

  private getDeviceSystem(key: UserKey): DeviceSystem | undefined {
    const platforms = key.deviceInfo.ionPlatforms as string[];
    if (platforms) {
      if (platforms.indexOf('android') >= 0) return 'android';
      if (platforms.indexOf('ios') >= 0) return 'ios';
    }
    if (key.deviceInfo?.platform?.toLowerCase() === 'windows') return 'windows';
    return undefined;
  }

  private getBrowserBrand(key: UserKey): BrowserBrand | undefined {
    if (Array.isArray(key.deviceInfo?.brands)) {
      for (const brand of key.deviceInfo.brands) {
        if (brand.brand?.toLowerCase() === 'google chrome') return 'chrome';
        if (brand.brand?.toLowerCase() === 'microsoft edge') return 'edge';
      }
    }
    if (key.deviceInfo?.userAgent?.indexOf('Firefox/') > 0) return 'firefox';
    return undefined;
  }

  private getDeviceDescription(key: UserKey): string {
    let s = key.deviceInfo.userAgent as string;
    let i = s.indexOf('(');
    if (i < 0) return '';
    s = s.substring(i + 1);
    i = s.indexOf(')');
    if (i > 0) s = s.substring(0, i);
    i = s.indexOf('Build/');
    if (i > 0) s = s.substring(0, i);
    return s;
  }

  private getAppVersion(key: UserKey): string | undefined {
    const code = key.deviceInfo.versionCode;
    if (typeof code !== 'number') return undefined;
    return StringUtils.versionCodeToVersionName(code);
  }

  isThisDevice(key: KeyDescription): boolean {
    return this.auth.auth?.keyId === key.id;
  }

  deleteKey(key: KeyDescription): void {
    if (this.keyDelete) this.keyDelete(key.id).subscribe(() => this.refreshKeys());
  }

}

type DeviceSystem = 'windows' | 'android' | 'ios';
type DeviceType = 'desktop' | 'mobile';
type BrowserBrand = 'chrome' | 'firefox' | 'edge';

interface KeyDescription {
  id: string;
  createdAt: number;
  lastUsage: number;

  appVersion?: string;

  native: boolean;
  deviceType?: DeviceType;
  system?: DeviceSystem;
  browser?: BrowserBrand;
  deviceDescription?: string;
}
