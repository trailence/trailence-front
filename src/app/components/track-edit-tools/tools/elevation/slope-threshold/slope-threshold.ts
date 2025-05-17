import { TrackEditTool, TrackEditToolContext } from '../../tool.interface';
import { ModalController } from '@ionic/angular/standalone';
import { SlopeThresholdModal } from './slope-threshold-modal';
import { applyElevationThresholdToTrack } from 'src/app/services/track-edition/elevation/elevation-threshold';
import { of } from 'rxjs';

export class SlopeThreshold implements TrackEditTool {

  readonly icon = undefined;
  labelKey(ctx: TrackEditToolContext): string { return 'slope_threshold.button_label'; }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return !ctx.selection.hasSelection() || ctx.selection.isRange();
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
