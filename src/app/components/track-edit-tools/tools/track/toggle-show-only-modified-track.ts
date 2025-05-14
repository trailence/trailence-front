import { TrackEditTool, TrackEditToolContext } from '../tool.interface';

export class ToogleShowOnlyModifiedTrack implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext) {
    return 'toggle_show_only_modified_track.button_label_' + (ctx.isBaseTrackShown() ? 'hide' : 'show');
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return ctx.hasModifications();
  }

  execute(ctx: TrackEditToolContext) {
    ctx.setShowBaseTrack(!ctx.isBaseTrackShown());
  }

}
