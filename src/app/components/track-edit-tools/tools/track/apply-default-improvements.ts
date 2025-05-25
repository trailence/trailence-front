import { TrackEditionService } from 'src/app/services/track-edition/track-edition.service';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { of } from 'rxjs';

export class ApplyDefaultImprovementsTool implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext): string {
    return 'apply_default_improvements';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return !ctx.selection.hasSelection() || ctx.selection.isRange();
  }

  execute(ctx: TrackEditToolContext): void {
    ctx.modifySelectedRange(true, track => {
      ctx.injector.get(TrackEditionService).applyDefaultImprovmentsOnTrack(track);
      return of(true);
    }).subscribe();
  }

}
