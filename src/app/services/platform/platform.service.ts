import { Injectable, Injector } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { Console } from 'src/app/utils/console';
import { I18nService } from '../i18n/i18n.service';
import { filter, firstValueFrom } from 'rxjs';

@Injectable({providedIn: 'root'})
export class PlatformService {
  constructor(
    injector: Injector,
    updates: SwUpdate,
  ) {
    Console.info('PWA updates: ', updates.isEnabled);
    if (updates.isEnabled) {
      updates.versionUpdates.subscribe(async event => {
        if (event.type === 'VERSION_READY') {
          Console.info('New version available');
          const i18n = await firstValueFrom(injector.get(I18nService).texts$.pipe(filter(t => !!t?.update)));
          await updates.activateUpdate();
          const m = await import('@ionic/angular/standalone');
          const t = await injector.get(m.ToastController).create({
            message: i18n.update.release_notes.popup.available,
            position: 'bottom',
            duration: 60000,
            buttons: [{
              text: i18n.update.release_notes.popup.later,
              role: 'cancel',
            }, {
              text: i18n.update.release_notes.popup.install,
              role: 'install',
            }]
          });
          t.onDidDismiss().then(result => {
            if (result.role === 'install') {
              document.location.reload();
            }
          });
          t.present();
        }
      });

      // Check immediately
      updates.checkForUpdate();
    }
  }
}
