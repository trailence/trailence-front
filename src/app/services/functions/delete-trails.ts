import { Injector } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { I18nService } from '../i18n/i18n.service';
import { AlertController } from '@ionic/angular/standalone';
import { ProgressService } from '../progress/progress.service';
import { TrailService } from '../database/trail.service';
import { Router } from '@angular/router';

export async function confirmDeleteTrails(injector: Injector, trails: Trail[], fromTrail: boolean) {
  const i18n = injector.get(I18nService);
  const texts = trails.length === 1 ? i18n.texts.pages.trails.actions.delete_confirm_single : i18n.texts.pages.trails.actions.delete_confirm_multiple;
  const alert = await injector.get(AlertController).create({
    header: trails.length === 1 ? texts.title : texts.title.replace('{{}}', '' + trails.length),
    message: texts.message.replace('{{}}', trails.length === 1 ? trails[0].name : '' + trails.length),
    buttons: [
      {
        text: texts.yes,
        role: 'danger',
        handler: () => {
          alert.dismiss(true);
          const progress = injector.get(ProgressService).create(i18n.texts.pages.trails.actions.deleting_trails, trails.length * 100);
          injector.get(TrailService).deleteMany(trails, progress, trails.length * 100, () => {
            progress.done();
            if (fromTrail) injector.get(Router).navigateByUrl('/trails/collection/' + trails[0].collectionUuid);
          });
        }
      }, {
        text: texts.no,
        role: 'cancel'
      }
    ]
  });
  await alert.present();
  return (await alert.onDidDismiss()).data === true;
}
