import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { AuthService } from 'src/app/services/auth/auth.service';
import { HttpService } from 'src/app/services/http/http.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { environment } from 'src/environments/environment';
import { IonButton, ModalController } from "@ionic/angular/standalone";
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-myaccount',
  templateUrl: './myaccount.page.html',
  styleUrls: ['./myaccount.page.scss'],
  standalone: true,
  imports: [IonButton, HeaderComponent, CommonModule]
})
export class MyaccountPage implements OnDestroy {

  keys?: UserKey[];
  email: string;
  complete: boolean;

  subscription: Subscription;

  constructor(
    public i18n: I18nService,
    private readonly http: HttpService,
    private readonly auth: AuthService,
    private readonly modalController: ModalController,
  ) {
    this.email = auth.email!;
    this.complete = auth.auth?.complete || false;
    this.subscription = auth.auth$.subscribe(a => this.complete = a?.complete || false);
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
    this.http.get<UserKey[]>(environment.apiBaseUrl + '/auth/v1/mykeys').subscribe(keys => {
      this.keys = keys;
      this.keys.sort((k1, k2) => k1.lastUsage - k2.lastUsage);
    });
  }

  deviceSystem(key: UserKey): string {
    const platforms = key.deviceInfo.ionPlatforms as string[];
    if (platforms) {
      if (platforms.indexOf('android') >= 0) return 'Android';
      if (platforms.indexOf('ios') >= 0) return 'iOS';
    }
    if (key.deviceInfo.platform) return key.deviceInfo.platform;
    return '?';
  }

  deviceApplicationType(key: UserKey): string {
    const platforms = key.deviceInfo.ionPlatforms as string[];
    if (platforms) {
      if (platforms.indexOf('capacitor') >= 0) return this.i18n.texts.pages.myaccount.devices_table.types.capacitor;
      if (platforms.indexOf('mobileweb') >= 0) return this.i18n.texts.pages.myaccount.devices_table.types.mobileweb;
      if (platforms.indexOf('desktop') >= 0) return this.i18n.texts.pages.myaccount.devices_table.types.desktop;
    }
    return '?';
  }

  deviceDetails(key: UserKey): string {
    let s = key.deviceInfo.userAgent as string;
    let i = s.indexOf('(');
    if (i < 0) return '';
    s = s.substring(i + 1);
    i = s.indexOf(')');
    if (i > 0) s = s.substring(0, i);
    return s;
  }

  isThisDevice(key: UserKey): boolean {
    return this.auth.auth?.keyId === key.id;
  }

  deleteKey(key: UserKey): void {
    this.http.delete(environment.apiBaseUrl + '/auth/v1/mykeys/' + key.id).subscribe(() => this.refreshKeys());
  }

}

interface UserKey {
  id: string;
  createdAt: number;
  lastUsage: number;
  deviceInfo: any;
}
