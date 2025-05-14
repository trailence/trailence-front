import { TrackEditTool, TrackEditToolContext } from '../../tool.interface';
import { ModalController } from '@ionic/angular/standalone';
import { SlopeThresholdModal } from './slope-threshold-modal';
import { applyElevationThresholdToTrack } from 'src/app/services/track-edition/elevation/elevation-threshold';
import { of } from 'rxjs';
import { isRange } from '../../selection.tool';

export class SlopeThreshold implements TrackEditTool {

  readonly icon = undefined;
  labelKey(ctx: TrackEditToolContext): string { return 'slope_threshold.button_label'; }

  isAvailable(ctx: TrackEditToolContext): boolean {
    const s = ctx.getSelection() as any;
    return !s || isRange(s);
  }

  execute(ctx: TrackEditToolContext): void {
    ctx.injector.get(ModalController).create({
      component: SlopeThresholdModal,
      cssClass: 'small-modal',
    }).then(m => {
      m.onDidDismiss().then(event => {
        if (event.data) {
          ctx.modifySelectedRange(true, track => {
            applyElevationThresholdToTrack(track, event.data.threshold, event.data.maxDistance);
            return of(true);
          }).subscribe();
        }
      });
      m.present();
    });
  }

}
