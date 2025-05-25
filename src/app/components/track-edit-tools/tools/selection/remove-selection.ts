import { of } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { Track } from 'src/app/model/track';
import { TrackUtils } from 'src/app/utils/track-utils';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { PointReference, RangeReference } from 'src/app/model/point-reference';

export class RemoveSelectionTool implements TrackEditTool {

  readonly icon = 'trash';
  labelKey(ctx: TrackEditToolContext) {
    return ctx.selection.isSinglePoint() ? 'remove_selection.button_single_label' : 'remove_selection.button_multiple_label';
  }
  readonly textColor = 'danger';

  isAvailable(ctx: TrackEditToolContext): boolean {
    return ctx.selection.hasSelection();
  }

  execute(ctx: TrackEditToolContext) {
    const currentTrack = ctx.currentTrack$.value;
    if (!currentTrack) return;
    const point = ctx.selection.getSinglePointOf(currentTrack);
    const range = point ? undefined : ctx.selection.getSubTrackOf(currentTrack);
    if (!point && !range) return;
    ctx.modifyTrack(false, track => {
      if (point) {
        this.removePoint(ctx, track, point);
      } else if (range) {
        this.removeRange(ctx, track, range.range);
      }
      return of(true);
    }).subscribe(() => ctx.selection.cancelSelection());
  }

  private removePoint(ctx: TrackEditToolContext, track: Track, point: PointReference): void {
    const wp = TrackUtils.findWayPoints(track, point.segmentIndex, point.pointIndex, point.segmentIndex, point.pointIndex, ctx.injector.get(PreferencesService));
    track.segments[point.segmentIndex].removePointAt(point.pointIndex);
    wp.forEach(w =>track.removeWayPoint(w));
  }

  private removeRange(ctx: TrackEditToolContext, track: Track, range: RangeReference): void {
    const wp = TrackUtils.findWayPoints(track, range.start.segmentIndex, range.start.pointIndex + 1, range.end.segmentIndex, range.end.pointIndex - 1, ctx.injector.get(PreferencesService));
    wp.forEach(w =>track.removeWayPoint(w));
    let endSi = range.end.segmentIndex;
    while (endSi > range.start.segmentIndex + 1) {
      track.removeSegmentAt(range.start.segmentIndex + 1);
      endSi--;
    }
    if (endSi > range.start.segmentIndex) {
      let segment = track.segments[range.start.segmentIndex];
      if (range.start.pointIndex < segment.points.length - 1)
        segment.removeMany(segment.points.slice(range.start.pointIndex + 1));
      segment = track.segments[endSi];
      if (range.end.pointIndex > 0)
        segment.removeMany(segment.points.slice(0, range.end.pointIndex));
    } else {
      const segment = track.segments[range.start.segmentIndex];
      if (range.end.pointIndex > range.start.pointIndex + 1)
        segment.removeMany(segment.points.slice(range.start.pointIndex + 1, range.end.pointIndex));
    }
  }
}
