import { adjustUnprobableElevationToTrackBasedOnGrade } from 'src/app/services/track-edition/elevation/unprobable-elevation-with-grade';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { of } from 'rxjs';
import { isRange } from '../selection.tool';

export class RemoveUnprobableElevation implements TrackEditTool {

  readonly icon = undefined;
  labelKey(ctx: TrackEditToolContext): string { return 'remove_unprobable_elevations.button_label'; }

  isAvailable(ctx: TrackEditToolContext): boolean {
    const s = ctx.getSelection() as any;
    return !s || isRange(s);
  }

  execute(ctx: TrackEditToolContext) {
    ctx.modifySelectedRange(true, track => {
      adjustUnprobableElevationToTrackBasedOnGrade(track);
      return of(track);
    }).subscribe();
  }
}
