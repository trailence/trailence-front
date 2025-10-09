import { removeUnprobablePointsOnTrack } from 'src/app/services/track-edition/path-analysis/remove-unprobable-points';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { of } from 'rxjs';

export class RemoveUnprobablePointsTool implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext) {
    return 'remove_unprobable_points';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return !ctx.selection.hasSelection() || ctx.selection.isRange();
  }

  execute(ctx: TrackEditToolContext) {
    ctx.modifySelectedRange(track => {
      removeUnprobablePointsOnTrack(track);
      return of(true);
    }, true, false).subscribe();
  }

}
