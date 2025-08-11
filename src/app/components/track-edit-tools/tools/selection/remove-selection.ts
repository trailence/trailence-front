import { of } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { Track } from 'src/app/model/track';
import { TrackUtils } from 'src/app/utils/track-utils';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { PointReference, RangeReference } from 'src/app/model/point-reference';

export class RemoveSelectionTool implements TrackEditTool {

  constructor(
    private readonly andOpen: boolean,
  ) {}

  readonly icon = 'trash';

  labelKey(ctx: TrackEditToolContext) {
    let key = ctx.selection.isSinglePoint() ? 'remove_selection.button_single_label' : 'remove_selection.button_multiple_label';
    if (this.andOpen) key += '_and_open';
    else if (ctx.currentTrack$.value) {
      if (ctx.selection.isSinglePoint()) {
        const p = ctx.selection.getSinglePointOf(ctx.currentTrack$.value);
        if (p && p.pointIndex > 0 && p.pointIndex < p.track.segments[p.segmentIndex].points.length - 1) {
          key += '_and_join';
        }
      } else {
        const r = ctx.selection.getRangeOf(ctx.currentTrack$.value);
        if (r && r.start.pointIndex > 0 && r.end.pointIndex < r.track.segments[r.end.segmentIndex].points.length - 1)
          key += '_and_join';
      }
    }
    return key;
  }
  readonly textColor = 'danger';

  isAvailable(ctx: TrackEditToolContext): boolean {
    if (!ctx.selection.hasSelection()) return false;
    if (this.andOpen) {
      const track = ctx.currentTrack$.value;
      if (!track) return false;
      const sel = ctx.selection.getSelectionForTrack(track);
      if (!sel) return false;
      if (sel instanceof PointReference) {
        if (sel.pointIndex === 0 || sel.pointIndex === track.segments[sel.segmentIndex].points.length - 1) return false;
      } else if (sel.start.pointIndex === 0 || sel.end.pointIndex === track.segments[sel.end.segmentIndex].points.length - 1) return false;
    }
    return true;
  }

  execute(ctx: TrackEditToolContext) {
    const currentTrack = ctx.currentTrack$.value;
    if (!currentTrack) return;
    const point = ctx.selection.getSinglePointOf(currentTrack);
    const range = point ? undefined : ctx.selection.getSubTrackOf(currentTrack);
    if (!point && !range) return;
    ctx.modifyTrack(false, track => {
      if (this.andOpen) {
        if (point) {
          this.splitPoint(ctx, track, point);
        } else if (range) {
          this.splitRange(ctx, track, range.range);
        }
      } else if (point) {
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

  private splitPoint(ctx: TrackEditToolContext, track: Track, point: PointReference): void {
    this.removePoint(ctx, track, point);
    this.splitAt(ctx, track, point.segmentIndex, point.pointIndex);
  }

  private splitRange(ctx: TrackEditToolContext, track: Track, range: RangeReference): void {
    this.removeRange(ctx, track, range);
    this.splitAt(ctx, track, range.start.segmentIndex, range.start.pointIndex + 1);
  }

  private splitAt(ctx: TrackEditToolContext, track: Track, segmentIndex: number, pointIndex: number): void {
    const points = track.segments[segmentIndex].points.slice(pointIndex);
    if (points.length === 0) return;
    const newSegment = segmentIndex === track.segments.length - 1 ? track.newSegment() : track.insertSegment(segmentIndex + 1);
    track.segments[segmentIndex].removeMany(points);
    newSegment.appendMany(points);
  }
}
