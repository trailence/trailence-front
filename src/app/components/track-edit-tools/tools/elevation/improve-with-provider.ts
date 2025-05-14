import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { isRange } from '../selection.tool';
import { GeoService } from 'src/app/services/geolocation/geo.service';
import { copyPoint, Point, PointDescriptor } from 'src/app/model/point';
import { improveElevationWithProvider } from 'src/app/services/track-edition/elevation/improve-elevations-with-provider';
import { map } from 'rxjs';

export class ImproveElevationWithProvider implements TrackEditTool {

  readonly icon = undefined;
  labelKey(ctx: TrackEditToolContext): string { return 'improve_elevation_with_provider.button_label'; }

  isAvailable(ctx: TrackEditToolContext): boolean {
    const s = ctx.getSelection() as any;
    return !s || isRange(s);
  }

  execute(ctx: TrackEditToolContext) {
    ctx.modifySelectedRange(true, track => {
      const points: Point[] = [];
      const toFill: PointDescriptor[] = [];
      for (const segment of track.segments)
        for (const point of segment.points) {
          points.push(point);
          toFill.push({...copyPoint(point), ele: undefined});
        }
      return ctx.injector.get(GeoService).fillPointsElevation(toFill, true, true).pipe(
        map(() => improveElevationWithProvider(points, toFill))
      );
    }).subscribe();
  }
}
