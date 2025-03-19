import { Injector } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { I18nService } from '../i18n/i18n.service';
import { AlertController } from '@ionic/angular/standalone';
import { TrailService } from '../database/trail.service';

export async function openRenameTrailDialog(injector: Injector, trail: Trail) {
  const i18n = injector.get(I18nService);
  const alert = await injector.get(AlertController).create({
    header: i18n.texts.pages.trails.actions.rename_popup.title,
    inputs: [{
      placeholder: i18n.texts.pages.trails.actions.rename_popup.name,
      value: trail.name,
      attributes: {
        maxlength: 200,
        counter: true,
      }
    }],
    buttons: [{
      text: i18n.texts.buttons.apply,
      role: 'ok',
      handler: (result) => {
        alert.dismiss();
        if (trail.name !== result[0].trim()) {
          injector.get(TrailService).doUpdate(trail, t => t.name = result[0].trim());
        }
      }
    }, {
      text: i18n.texts.buttons.cancel,
      role: 'cancel'
    }]
  });
  await alert.present();
}
