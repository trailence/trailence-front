import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { of } from 'rxjs';
import { removeBreaksMovesOnTrack } from 'src/app/services/track-edition/path-analysis/remove-breaks-moves';

export class RemoveBreaksMovesTool implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext) {
    return 'remove_breaks_moves';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return !ctx.selection.hasSelection() || ctx.selection.isRange();
  }

  execute(ctx: TrackEditToolContext) {
    ctx.modifySelectedRange(track => {
      removeBreaksMovesOnTrack(track);
      return of(true);
    }, true, false).subscribe();
  }

}
