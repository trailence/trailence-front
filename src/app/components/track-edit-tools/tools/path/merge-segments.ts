import { of } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';

export class MergeSegementsTool implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext): string {
    return 'merge_segments';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return !ctx.selection.hasSelection() && !!ctx.currentTrack$.value && ctx.currentTrack$.value?.segments.length > 1;
  }

  execute(ctx: TrackEditToolContext): void {
    ctx.modifyTrack(track => {
      track.removeEmptySegments();
      while (track.segments.length > 1) {
        track.segments[0].appendMany(track.segments[1].points);
        track.removeSegmentAt(1);
      }
      return of(true);
    }, false, false).subscribe();
  }

}
