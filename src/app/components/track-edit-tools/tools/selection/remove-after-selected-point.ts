import { of } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { TrackUtils } from 'src/app/utils/track-utils';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';

export class RemoveAfterSelectedPointTool implements TrackEditTool {

  readonly icon = 'trash';
  labelKey(ctx: TrackEditToolContext) {
    return 'selection.remove_all_next_points';
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
    ctx.modifyTrack(false, track => {
      const wp = TrackUtils.findWayPoints(track, point.segmentIndex, point.pointIndex + 1, track.segments.length - 1, track.segments[track.segments.length - 1].points.length - 1, ctx.injector.get(PreferencesService));
      wp.forEach(w =>track.removeWayPoint(w));
      while (track.segments.length > point.segmentIndex + 1) track.removeSegmentAt(point.segmentIndex + 1);
      const pi = point.pointIndex;
      const segment = track.segments[point.segmentIndex];
      if (pi < segment.points.length - 1) {
        segment.removeMany(segment.points.slice(pi + 1));
      }
      return of(true);
    }).subscribe(() => ctx.selection.cancelSelection());
  }

}
