import { adjustUnprobableElevationToTrackBasedOnGrade } from 'src/app/services/track-edition/elevation/unprobable-elevation-with-grade';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { of } from 'rxjs';

export class RemoveUnprobableElevation implements TrackEditTool {

  readonly icon = undefined;
  labelKey(ctx: TrackEditToolContext): string { return 'remove_unprobable_elevations'; }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return !ctx.selection.hasSelection() || ctx.selection.isRange();
  }

  execute(ctx: TrackEditToolContext) {
    ctx.modifySelectedRange(track => {
      adjustUnprobableElevationToTrackBasedOnGrade(track);
      return of(track);
    }, true, false).subscribe();
  }
}
