import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { GeoService } from 'src/app/services/geolocation/geo.service';

export class ReplaceElevationWithProvider implements TrackEditTool {

  readonly icon = undefined;
  labelKey(ctx: TrackEditToolContext): string { return 'replace_elevation_with_provider'; }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return !ctx.selection.hasSelection() || ctx.selection.isRange();
  }

  execute(ctx: TrackEditToolContext) {
    ctx.modifySelectedRange(true, track => {
      for (const segment of track.segments)
        for (const point of segment.points) {
          point.ele = undefined;
          point.eleAccuracy = undefined;
        }
      return ctx.injector.get(GeoService).fillTrackElevation(track, true);
    }).subscribe();
  }
}
