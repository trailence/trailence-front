import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { GeoService } from '@trailence/services/geolocation/geo.service';

export class FillMissingElevationWithProvider implements TrackEditTool {

  readonly icon = undefined;
  labelKey(ctx: TrackEditToolContext): string { return 'fill_missing_elevation_with_provider'; }

  isAvailable(ctx: TrackEditToolContext): boolean {
    const track = ctx.currentTrack$.value;
    if (!track) return false;
    const hasMissing = track.forEachPoint(p => p.ele === undefined);
    return !!hasMissing;
  }

  execute(ctx: TrackEditToolContext) {
    ctx.modifyTrack(track => {
      return ctx.injector.get(GeoService).fillTrackElevation(track, true);
    }, true, false).subscribe();
  }
}
