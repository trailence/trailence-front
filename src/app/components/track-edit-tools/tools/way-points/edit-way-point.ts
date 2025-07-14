import { Observable, of } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { TrackUtils } from 'src/app/utils/track-utils';
import { ModalController } from '@ionic/angular/standalone';
import { WayPoint } from 'src/app/model/way-point';

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
    return TrackUtils.getWayPointAt(currentTrack, point.point.pos) !== undefined ||
      (point.segmentIndex === 0 && point.pointIndex === 0) ||
      (point.segmentIndex === currentTrack.segments.length - 1 && point.pointIndex === currentTrack.segments[point.segmentIndex].points.length - 1);
  }

  execute(ctx: TrackEditToolContext) {
    const currentTrack = ctx.currentTrack$.value;
    if (!currentTrack) return;
    const point = ctx.selection.getSinglePointOf(currentTrack);
    if (!point) return;
    ctx.modifyTrack(true, track => {
      let w = TrackUtils.getWayPointAt(track, point.point.pos);
      let isNew = false;
      if (!w) {
        if ((point.pointIndex === 0 && point.segmentIndex === 0) || (point.segmentIndex === track.segments.length - 1 && point.pointIndex === track.segments[point.segmentIndex].points.length - 1)) {
          // departure or arrival point
          w = new WayPoint(point.point, '', '');
          isNew = true;
        }
      }
      if (!w) return of(true);
      return new Observable<boolean>(subscriber => {
        import('./way-point-edit/way-point-edit.component')
        .then(module => ctx.injector.get(ModalController).create({
          component: module.WayPointEditModal,
          componentProps: {
            wayPoint: w,
            isNew,
          }
        }))
        .then(modal => {
          modal.onDidDismiss().then(result => {
            if (result.role === 'ok' && isNew) {
              track.appendWayPoint(w);
            }
            subscriber.complete();
          });
          modal.present();
        });
      });
    }).subscribe(() => ctx.refreshTools());
  }

}
