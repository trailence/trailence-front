import { of } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { TrackUtils } from 'src/app/utils/track-utils';
import { WayPoint } from 'src/app/model/way-point';

export class RemoveWayPointTool implements TrackEditTool {

  readonly icon = 'trash';
  labelKey(ctx: TrackEditToolContext) {
    return 'way_points.remove_waypoint';
  }
  readonly textColor = 'danger';

  isAvailable(ctx: TrackEditToolContext): boolean {
    const currentTrack = ctx.currentTrack$.value;
    if (!currentTrack) return false;
    const wayPoint = ctx.selection.selectedWayPoint$.value;
    if (wayPoint) return true;
    const point = ctx.selection.getSinglePointOf(currentTrack);
    if (!point) return false;
    if (point.segmentIndex === 0 && point.pointIndex === 0) return false;
    if (point.segmentIndex === currentTrack.segments.length -1 && point.pointIndex === currentTrack.segments[point.segmentIndex].points.length - 1) return false;
    return TrackUtils.getWayPointAt(ctx.currentTrack$.value, point.point.pos) !== undefined;
  }

  public launchRemove(wp: WayPoint, ctx: TrackEditToolContext) {
    ctx.selection.selectedWayPoint$.next(wp);
    this.execute(ctx);
  }

  execute(ctx: TrackEditToolContext) {
    const currentTrack = ctx.currentTrack$.value;
    if (!currentTrack) return;
    const wayPoint = ctx.selection.selectedWayPoint$.value;
    const point = ctx.selection.getSinglePointOf(currentTrack);
    if (!point && !wayPoint) return;
    ctx.modifyTrack(true, track => {
      const w = wayPoint ? track.wayPoints[currentTrack.wayPoints.indexOf(wayPoint)] : TrackUtils.getWayPointAt(track, point!.point.pos);
      if (w) {
        track.removeWayPoint(w);
        ctx.selection.selectedWayPoint$.next(undefined);
      }
      return of(true);
    }).subscribe(() => ctx.refreshTools());
  }

}
