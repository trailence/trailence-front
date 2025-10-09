import { of } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { TrackUtils } from 'src/app/utils/track-utils';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';

export class RemoveBeforeSelectedPointTool implements TrackEditTool {

  readonly icon = 'trash';
  labelKey(ctx: TrackEditToolContext) {
    return 'selection.remove_all_previous_points';
  }
  readonly textColor = 'danger';

  isAvailable(ctx: TrackEditToolContext): boolean {
    return ctx.selection.isSinglePoint();
  }

  execute(ctx: TrackEditToolContext) {
    const currentTrack = ctx.currentTrack$.value;
    if (!currentTrack) return;
    const point = ctx.selection.getSinglePointOf(currentTrack);
    if (!point) return;
    ctx.modifyTrack(track => {
      const wp = TrackUtils.findWayPoints(track, 0, 0, point.segmentIndex, point.pointIndex - 1, ctx.injector.get(PreferencesService));
      wp.forEach(w =>track.removeWayPoint(w));
      let si = point.segmentIndex;
      while (si > 0) {
        track.removeSegmentAt(0);
        si--;
      }
      const pi = point.pointIndex;
      const segment = track.segments[0];
      if (pi > 0) {
        segment.removeMany(segment.points.slice(0, pi));
      }
      return of(true);
    }, false, false).subscribe(() => ctx.selection.cancelSelection());
  }

}
