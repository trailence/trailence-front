import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { TrackService } from 'src/app/services/database/track.service';

export class BackToOriginalTrack implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext) {
    return 'back_to_original_track';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return !ctx.selection.hasSelection();
  }

  execute(ctx: TrackEditToolContext) {
    ctx.injector.get(TrackService).getFullTrackReady$(ctx.trail.originalTrackUuid, ctx.trail.owner).subscribe(
      originalTrack => ctx.setBaseTrack(originalTrack)
    );
  }

}
