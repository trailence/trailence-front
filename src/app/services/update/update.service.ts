import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular/standalone';
import { environment } from 'src/environments/environment';
import { APK_PATH, AppDownload } from './common';


@Injectable({providedIn: 'root'})
export class UpdateService {

  public availableDownload?: AppDownload;

  constructor(
    private readonly platform: Platform,
  ) {
    if (this.platform.is('android') && this.platform.is('mobileweb'))
      this.availableDownload = {
        icon: 'android',
        i18nText: 'download_android',
        launch: () => {
          window.open(environment.baseUrl + APK_PATH, '_blank');
        },
      };
  }

}
