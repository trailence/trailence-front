import { of } from 'rxjs';
import { isRange, isSinglePoint } from '../selection.tool';
import { PointReference, PointReferenceRange, TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { Track } from 'src/app/model/track';
import { TrackUtils } from 'src/app/utils/track-utils';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';

export class RemoveSelectionTool implements TrackEditTool {

  readonly icon = 'trash';
  labelKey(ctx: TrackEditToolContext) {
    return (ctx.getSelection() as any)?.pointIndex !== undefined ? 'remove_selection.button_single_label' : 'remove_selection.button_multiple_label';
  }
  readonly textColor = 'danger';

  isAvailable(ctx: TrackEditToolContext): boolean {
    return !!ctx.getSelection();
  }

  execute(ctx: TrackEditToolContext) {
    const selection = ctx.getSelection();
    if (!selection) return;
    ctx.modifyTrack(false, track => {
      if (isSinglePoint(selection)) {
        this.removePoint(ctx, track, selection as PointReference);
      } else if (isRange(selection)) {
        this.removeRange(ctx, track, selection as PointReferenceRange);
      }
      return of(true);
    }).subscribe(() => ctx.cancelSelection());
  }

  private removePoint(ctx: TrackEditToolContext, track: Track, point: PointReference): void {
    const wp = TrackUtils.findWayPoints(track, point.segmentIndex, point.pointIndex, point.segmentIndex, point.pointIndex, ctx.injector.get(PreferencesService));
    track.segments[point.segmentIndex].removePointAt(point.pointIndex);
    wp.forEach(w =>track.removeWayPoint(w));
  }

  private removeRange(ctx: TrackEditToolContext, track: Track, range: PointReferenceRange): void {
    const wp = TrackUtils.findWayPoints(track, range.start.segmentIndex, range.start.pointIndex + 1, range.end.segmentIndex, range.end.pointIndex - 1, ctx.injector.get(PreferencesService));
    wp.forEach(w =>track.removeWayPoint(w));
    while (range.end.segmentIndex > range.start.segmentIndex + 1) {
      track.removeSegmentAt(range.start.segmentIndex + 1);
      range.end.segmentIndex--;
    }
    if (range.end.segmentIndex > range.start.segmentIndex) {
      let segment = track.segments[range.start.segmentIndex];
      if (range.start.pointIndex < segment.points.length - 1)
        segment.removeMany(segment.points.slice(range.start.pointIndex + 1));
      segment = track.segments[range.end.segmentIndex];
      if (range.end.pointIndex > 0)
        segment.removeMany(segment.points.slice(0, range.end.pointIndex));
    } else {
      const segment = track.segments[range.start.segmentIndex];
      if (range.end.pointIndex > range.start.pointIndex + 1)
        segment.removeMany(segment.points.slice(range.start.pointIndex + 1, range.end.pointIndex));
    }
  }
}
