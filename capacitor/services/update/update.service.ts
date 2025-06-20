import { Injectable, Injector } from '@angular/core';
import { APK_PATH, AppDownload } from 'src/app/services/update/common';
import { Platform, AlertController, ModalController } from '@ionic/angular/standalone';
import { catchError, first, map, Observable, of, switchMap } from 'rxjs';
import { HttpService } from 'src/app/services/http/http.service';
import { environment } from 'src/environments/environment';
import { trailenceAppVersionCode } from 'src/app/trailence-version';
import { NetworkService } from 'src/app/services/network/network.service';
import Trailence from '../trailence.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { ProgressService } from 'src/app/services/progress/progress.service';
import { ErrorService } from 'src/app/services/progress/error.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { Console } from 'src/app/utils/console';

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

  private failures = 0;

  private checkApkUpdate(): void {
    this.network.server$.pipe(
      debounceTimeExtended(0, 120000, 10, () => this.failures < 3),
      switchMap(connected => !connected ? of(null) : this.checkApk()),
      filterDefined(),
      first(),
    ).subscribe(available => {
      if (available) {
        this.availableDownload = {
          icon: 'android',
          i18nText: 'update_android',
          badge: '⟳',
          launch: () => { this.displayUpdate(); },
        };
      }
    });
  }

  private checkApk(): Observable<boolean | null> {
    Console.info('Check APK version, previous failures: ' + this.failures);
    return this.http.get(environment.baseUrl + '/assets/apk/metadata.json').pipe(
      map((metadata: any) => {
        Console.info('Check APK version response', metadata);
        if (Array.isArray(metadata?.elements) && metadata.elements[0].versionCode && metadata.elements[0].versionCode > trailenceAppVersionCode) {
          this.failures = 0;
          return true;
        }
        return false;
      }),
      catchError(() => {
        this.failures++;
        Console.info('Check APK version failed: ' + this.failures);
        return of(null);
      })
    );
  }

  private async displayUpdate() {
    const module = await import('src/app/components/updates/release-notes-popup/release-notes-popup.component');
    const modal = await this.injector.get(ModalController).create({
      component: module.ReleaseNotesPopup,
      componentProps: { sinceVersion: trailenceAppVersionCode, type: 'available' },
      cssClass: 'small-modal',
    });
    await modal.present();
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
