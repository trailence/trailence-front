import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular/common';
import { environment } from 'src/environments/environment';
import { AppDownload } from './common';
import { PreferencesService } from '../preferences/preferences.service';


@Injectable({providedIn: 'root'})
export class UpdateService {

  public availableDownload?: AppDownload;

  constructor(
    private readonly platform: Platform,
    prefs: PreferencesService,
  ) {
    if (this.platform.is('android') && this.platform.is('mobileweb'))
      this.availableDownload = {
        icon: 'android',
        i18nText: 'download_android',
        launch: () => {
          window.open(environment.baseUrl + '/' + prefs.preferences.lang + '/install-apk', '_blank');
        },
      };
  }

  public downloadAndUpdate() {
    // nothing for web app
  }

}
