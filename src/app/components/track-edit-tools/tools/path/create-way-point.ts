import { of } from 'rxjs';
import { isSinglePoint } from '../selection.tool';
import { PointReference, TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { TrackUtils } from 'src/app/utils/track-utils';
import { WayPoint } from 'src/app/model/way-point';

export class CreateWayPointTool implements TrackEditTool {

  readonly icon = 'location';
  labelKey(ctx: TrackEditToolContext) {
    return 'selection.create_waypoint';
  }
  readonly textColor = 'success';

  isAvailable(ctx: TrackEditToolContext): boolean {
    const selection = ctx.getSelection();
    if (!isSinglePoint(selection)) return false;
    if (!ctx.currentTrack$.value) return false;
    const point = selection as PointReference;
    return TrackUtils.getWayPointAt(ctx.currentTrack$.value, point.point.pos) === undefined;
  }

  execute(ctx: TrackEditToolContext) {
    const selection = ctx.getSelection();
    if (!selection) return;
    ctx.modifyTrack(false, track => {
      if (!isSinglePoint(selection)) return of(true);
      const point = (selection as PointReference).point;
      track.appendWayPoint(new WayPoint(point, '', ''));
      return of(true);
    }).subscribe(() => ctx.refreshTools());
  }

}
