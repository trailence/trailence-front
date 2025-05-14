import { of } from 'rxjs';
import { isSinglePoint } from '../selection.tool';
import { PointReference, TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { TrackUtils } from 'src/app/utils/track-utils';

export class RemoveWayPointTool implements TrackEditTool {

  readonly icon = 'location';
  labelKey(ctx: TrackEditToolContext) {
    return 'selection.remove_waypoint';
  }
  readonly textColor = 'danger';

  isAvailable(ctx: TrackEditToolContext): boolean {
    const selection = ctx.getSelection();
    if (!isSinglePoint(selection)) return false;
    if (!ctx.currentTrack$.value) return false;
    const point = selection as PointReference;
    return TrackUtils.getWayPointAt(ctx.currentTrack$.value, point.point.pos) !== undefined;
  }

  execute(ctx: TrackEditToolContext) {
    const selection = ctx.getSelection();
    if (!selection) return;
    ctx.modifyTrack(false, track => {
      if (!isSinglePoint(selection)) return of(true);
      const point = (selection as PointReference).point;
      const w = TrackUtils.getWayPointAt(track, point.pos);
      if (w) track.removeWayPoint(w);
      return of(true);
    }).subscribe(() => ctx.refreshTools());
  }

}
