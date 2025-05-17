import { Observable, of } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { TrackUtils } from 'src/app/utils/track-utils';
import { ModalController } from '@ionic/angular/standalone';

export class EditWayPointTool implements TrackEditTool {

  readonly icon = 'edit';
  labelKey(ctx: TrackEditToolContext) {
    return 'way_points.edit_waypoint';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    const currentTrack = ctx.currentTrack$.value;
    if (!currentTrack) return false;
    const point = ctx.selection.getSinglePointOf(currentTrack);
    if (!point) return false;
    return TrackUtils.getWayPointAt(ctx.currentTrack$.value, point.point.pos) !== undefined;
  }

  execute(ctx: TrackEditToolContext) {
    const currentTrack = ctx.currentTrack$.value;
    if (!currentTrack) return;
    const point = ctx.selection.getSinglePointOf(currentTrack);
    if (!point) return;
    ctx.modifyTrack(true, track => {
      const w = TrackUtils.getWayPointAt(track, point.point.pos);
      if (!w) return of(true);
      return new Observable<boolean>(subscriber => {
        import('./way-point-edit/way-point-edit.component')
        .then(module => ctx.injector.get(ModalController).create({
          component: module.WayPointEditModal,
          componentProps: {
            wayPoint: w,
            isNew: false,
          }
        }))
        .then(modal => {
          modal.onDidDismiss().then(result => {
            subscriber.complete();
          });
          modal.present();
        });
      });
    }).subscribe(() => ctx.refreshTools());
  }

}
