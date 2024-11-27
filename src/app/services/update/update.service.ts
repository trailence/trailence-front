import { Injectable, Injector } from '@angular/core';
import { Platform, AlertController } from '@ionic/angular/standalone';
import { environment } from 'src/environments/environment';
import { NetworkService } from '../network/network.service';
import { catchError, EMPTY, first, map, Observable, of, switchMap } from 'rxjs';
import { HttpService } from '../http/http.service';
import { trailenceAppVersionCode, trailenceAppVersionName } from 'src/app/trailence-version';
import Trailence from 'src/app/services/trailence.service';
import { ProgressService } from '../progress/progress.service';
import { ErrorService } from '../progress/error.service';
import { I18nService } from '../i18n/i18n.service';

export interface AppDownload {
  url: string;
  icon: string;
  i18nText: string;
}

@Injectable({providedIn: 'root'})
export class UpdateService {

  public versionName = trailenceAppVersionName;
  public versionCode = trailenceAppVersionCode;

  public downloadApp?: AppDownload;
  public updateApp?: AppDownload;

  constructor(
    private readonly platform: Platform,
    private readonly network: NetworkService,
    private readonly http: HttpService,
    private readonly injector: Injector,
  ) {
    this.downloadApp = this.getDownload();
    if (platform.is('capacitor')) {
      this.network.server$.pipe(
        switchMap(connected => !connected ? EMPTY : this.checkUpdate()),
        first(),
      ).subscribe(url => this.updateApp = url || undefined);
    }
  }

  private getDownload(): AppDownload | undefined {
    if (!this.platform.is('mobileweb') || this.platform.is('capacitor')) return undefined;
    if (this.platform.is('android'))
      return {
        url: this.apkUrl(),
        icon: this.apkIcon(),
        i18nText: this.apkDownloadText(),
      };
    return undefined;
  }

  private checkUpdate(): Observable<AppDownload | null> {
    if (this.platform.is('android')) return this.checkUpdateApk();
    return of(null);
  }

  private checkUpdateApk(): Observable<AppDownload | null> {
    return this.http.get(environment.baseUrl + '/assets/apk/metadata.json').pipe(
      map((metadata: any) => {
        if (metadata.elements && metadata.elements[0].versionCode && metadata.elements[0].versionCode > this.versionCode) { // NOSONAR
          return {
            url: this.apkUrl(),
            icon: this.apkIcon(),
            i18nText: this.apkUpdateText(),
          };
        }
        return null;
      }),
      catchError(() => EMPTY)
    );
  }

  private apkUrl(): string {
    return environment.baseUrl + '/assets/apk/trailence.apk';
  }

  private apkIcon(): string {
    return 'android';
  }

  private apkDownloadText(): string {
    return 'download_android';
  }

  private apkUpdateText(): string {
    return 'update_android';
  }

  public download(): void {
    const app = this.downloadApp || this.updateApp;
    if (!app) return;
    Trailence.downloadUsingBrowser({url: app.url});
  }

  public async downloadAndUpdate() {
    const canInstall = await Trailence.canInstallUpdate({});
    if (canInstall.allowed) {
      this.launchDownloadAndUpdate();
      return;
    }
    const allowed = await Trailence.requestInstallPermission({});
    if (allowed.allowed) {
      this.launchDownloadAndUpdate();
      return;
    }
    const i18n = this.injector.get(I18nService);
    const alert = await this.injector.get(AlertController).create({
      header: i18n.texts.update.update_android,
      message: i18n.texts.update.not_allowed,
      buttons: [
        {
          text: i18n.texts.update.download_manually,
          role: 'confirm',
          handler: () => {
            this.download();
            this.injector.get(AlertController).dismiss();
          }
        }, {
          text: i18n.texts.buttons.cancel,
          role: 'cancel',
          handler: () => {
            this.injector.get(AlertController).dismiss();
          }
        }
      ]
    });
    await alert.present();
  }

  private launchDownloadAndUpdate() {
    const i18n = this.injector.get(I18nService);
    const progress = this.injector.get(ProgressService).create(i18n.texts.update.updating, 101);
    progress.subTitle = i18n.texts.update.downloading;
    Trailence.downloadAndInstall({url: this.updateApp!.url}, status => {
      if (status.done) {
        progress.done();
      } else if (status.error) {
        progress.done();
        this.injector.get(ErrorService).addError(status.error);
      } else {
        if (status.i18n)
          progress.subTitle = i18n.texts.update[status.i18n];
        if (status.progress)
          progress.workDone = status.progress;
      }
    });
  }

}
