import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { AuthService } from 'src/app/services/auth/auth.service';
import { HttpService } from 'src/app/services/http/http.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { environment } from 'src/environments/environment';
import { IonButton, IonIcon, ModalController } from "@ionic/angular/standalone";
import { first, Subscription, switchMap } from 'rxjs';
import { NetworkService } from 'src/app/services/network/network.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';

@Component({
    selector: 'app-myaccount',
    templateUrl: './myaccount.page.html',
    styleUrls: ['./myaccount.page.scss'],
    imports: [IonButton, IonIcon, HeaderComponent, CommonModule]
})
export class MyaccountPage implements OnDestroy {

  keys?: KeyDescription[];
  email: string;
  complete: boolean;

  subscription: Subscription;

  constructor(
    public readonly i18n: I18nService,
    public readonly network: NetworkService,
    private readonly http: HttpService,
    private readonly auth: AuthService,
    private readonly modalController: ModalController,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    this.email = auth.email!;
    this.complete = auth.auth?.complete || false;
    this.subscription = auth.auth$.subscribe(a => {
      const newValue = a?.complete || false;
      if (this.complete !== newValue) {
        this.complete = newValue;
        this.changeDetector.detectChanges();
      }
    });
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  ionViewWillEnter(): void {
    this.refreshKeys();
  }

  async changePassword() {
    const module = await import('./change-password/change-password.component');
    const modal = await this.modalController.create({
      component: module.ChangePasswordComponent
    });
    modal.present();
  }

  refreshKeys(): void {
    this.keys = undefined;
    this.network.server$.pipe(
      filterDefined(),
      first(),
      switchMap(() => this.http.get<UserKey[]>(environment.apiBaseUrl + '/auth/v1/mykeys'))
    ).subscribe(keys => {
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
    return {
      id: key.id,
      createdAt: key.createdAt,
      lastUsage: key.lastUsage,
      native,
      deviceType,
      system,
      browser,
      deviceDescription,
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

  isThisDevice(key: KeyDescription): boolean {
    return this.auth.auth?.keyId === key.id;
  }

  deleteKey(key: KeyDescription): void {
    this.http.delete(environment.apiBaseUrl + '/auth/v1/mykeys/' + key.id).subscribe(() => this.refreshKeys());
  }

}

interface UserKey {
  id: string;
  createdAt: number;
  lastUsage: number;
  deviceInfo: any;
}

type DeviceSystem = 'windows' | 'android' | 'ios';
type DeviceType = 'desktop' | 'mobile';
type BrowserBrand = 'chrome' | 'firefox' | 'edge';

interface KeyDescription {
  id: string;
  createdAt: number;
  lastUsage: number;

  native: boolean;
  deviceType?: DeviceType;
  system?: DeviceSystem;
  browser?: BrowserBrand;
  deviceDescription?: string;
}
