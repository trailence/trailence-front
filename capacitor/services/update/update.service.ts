import { Injectable, Injector } from '@angular/core';
import { APK_PATH, AppDownload } from 'src/app/services/update/common';
import { Platform, AlertController } from '@ionic/angular/standalone';
import { catchError, filter, first, map, Observable, of, switchMap } from 'rxjs';
import { HttpService } from 'src/app/services/http/http.service';
import { environment } from 'src/environments/environment';
import { trailenceAppVersionCode } from 'src/app/trailence-version';
import { NetworkService } from 'src/app/services/network/network.service';
import Trailence from '../trailence.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { ProgressService } from 'src/app/services/progress/progress.service';
import { ErrorService } from 'src/app/services/progress/error.service';

@Injectable({providedIn: 'root'})
export class UpdateService {

  public availableDownload?: AppDownload;

  constructor(
    private readonly platform: Platform,
    private readonly http: HttpService,
    private readonly network: NetworkService,
    private readonly injector: Injector,
  ) {
    if (this.platform.is('android')) this.checkApkUpdate();
  }

  private checkApkUpdate(): void {
    this.network.server$.pipe(
      switchMap(connected => !connected ? of(null) : this.checkApk()),
      filter(updateAvailable => updateAvailable !== null),
      first(),
    ).subscribe(available => {
      if (available) {
        this.availableDownload = {
          icon: 'android',
          i18nText: 'update_android',
          badge: '⟳',
          launch: () => { this.downloadAndUpdate(); },
        };
      }
    });
  }

  private checkApk(): Observable<boolean | null> {
    return this.http.get(environment.baseUrl + '/assets/apk/metadata.json').pipe(
      map((metadata: any) => {
        if (Array.isArray(metadata?.elements) && metadata.elements[0].versionCode && metadata.elements[0].versionCode > trailenceAppVersionCode)
          return true;
        return false;
      }),
      catchError(() => of(null))
    );
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
            Trailence.downloadUsingBrowser({url: environment.baseUrl + APK_PATH});
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
    Trailence.downloadAndInstall({url: environment.baseUrl + APK_PATH}, status => {
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
