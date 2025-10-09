import { of } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { TrailService } from 'src/app/services/database/trail.service';

export class RemoveTime implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext) {
    return 'remove_time';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return !!ctx.currentTrack$.value;
  }

  execute(ctx: TrackEditToolContext) {
    ctx.modifyTrack(track => {
      if (!ctx.trail.date && track.startDate) {
        const date = track.startDate;
        ctx.injector.get(TrailService).doUpdate(ctx.trail, t => t.date = date);
      }
      track.forEachPoint(p => p.time = undefined);
      return of(true);
    }, false, false).subscribe(() => ctx.refreshTools());
  }

}
