import { Observable } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { TrackUtils } from 'src/app/utils/track-utils';
import { WayPoint } from 'src/app/model/way-point';
import { ModalController } from '@ionic/angular/standalone';

export class CreateWayPointTool implements TrackEditTool {

  readonly icon = 'add';
  labelKey(ctx: TrackEditToolContext) {
    return 'way_points.create_waypoint';
  }
  readonly textColor = 'success';

  isAvailable(ctx: TrackEditToolContext): boolean {
    const currentTrack = ctx.currentTrack$.value;
    if (!currentTrack) return false;
    const point = ctx.selection.getSinglePointOf(currentTrack);
    if (!point) return false;
    if (ctx.selection.selectedWayPoint$.value) return false;
    if (point.segmentIndex === 0 && point.pointIndex === 0) return false;
    if (point.segmentIndex === currentTrack.segments.length -1 && point.pointIndex === currentTrack.segments[point.segmentIndex].points.length - 1) return false;
    return TrackUtils.getWayPointAt(ctx.currentTrack$.value, point.point.pos) === undefined;
  }

  execute(ctx: TrackEditToolContext) {
    const currentTrack = ctx.currentTrack$.value;
    if (!currentTrack) return;
    const point = ctx.selection.getSinglePointOf(currentTrack);
    if (!point) return;
    ctx.modifyTrack(true, track => {
      const wp = new WayPoint(point.point, '', '');
      return new Observable<boolean>(subscriber => {
        import('./way-point-edit/way-point-edit.component')
        .then(module => ctx.injector.get(ModalController).create({
          component: module.WayPointEditModal,
          componentProps: {
            wayPoint: wp,
            isNew: true,
          }
        }))
        .then(modal => {
          modal.onDidDismiss().then(result => {
            if (result.role === 'ok') {
              track.appendWayPoint(wp);
            }
            subscriber.complete();
          });
          modal.present();
        });
      });
    }).subscribe(() => ctx.refreshTools());
  }

}
