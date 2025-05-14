import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { isRange } from '../selection.tool';
import { GeoService } from 'src/app/services/geolocation/geo.service';

export class ReplaceElevationWithProvider implements TrackEditTool {

  readonly icon = undefined;
  labelKey(ctx: TrackEditToolContext): string { return 'replace_elevation_with_provider.button_label'; }

  isAvailable(ctx: TrackEditToolContext): boolean {
    const s = ctx.getSelection() as any;
    return !s || isRange(s);
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
