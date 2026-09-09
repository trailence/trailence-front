import { of } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';

export class ReverseWay implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext) {
    return 'reverse_way';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    const track = ctx.currentTrack$.value;
    if (!track) return false;
    return !ctx.selection.hasSelection();
  }

  execute(ctx: TrackEditToolContext) {
    const currentTrack = ctx.currentTrack$.value;
    if (!currentTrack) return;
    ctx.setTrack(track => {
      return of(track.reverse(false));
    }).subscribe(() => ctx.refreshTools());
  }

}
