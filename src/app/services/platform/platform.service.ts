import { Injectable, Injector } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { I18nService } from '../i18n/i18n.service';
import { filter, firstValueFrom } from 'rxjs';
import { getLogger } from '@trailence/utils/console';

const logger = getLogger('platform.service');

@Injectable({providedIn: 'root'})
export class PlatformService {
  constructor(
    injector: Injector,
    updates: SwUpdate,
  ) {
    logger.info('PWA updates: ', updates.isEnabled);
    if (updates.isEnabled) {
      updates.versionUpdates.subscribe(async event => {
        if (event.type === 'VERSION_READY') {
          logger.info('New version available');
          const i18n = await firstValueFrom(injector.get(I18nService).texts$.pipe(filter(t => !!t?.update)));
          await updates.activateUpdate();
          const m = await import('@ionic/angular');
          const t = await injector.get(m.ToastController).create({
            message: i18n.update.release_notes.popup.available,
            position: 'bottom',
            duration: 60000,
            buttons: [{
              text: i18n.update.release_notes.popup.later,
              role: 'cancel',
            }, {
              text: i18n.update.release_notes.popup.download,
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
