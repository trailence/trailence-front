import { of } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { copyPoint, PointDescriptor } from 'src/app/model/point';

export class BackToDeparture implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext) {
    return 'back_to_departure';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    if (ctx.selection.hasSelection()) return false;
    const track = ctx.currentTrack$.value;
    if (!track) return false;
    return !!track.departurePoint && !!track.arrivalPoint && track.departurePoint.distanceTo(track.arrivalPoint.pos) > 100;
  }

  execute(ctx: TrackEditToolContext) {
    ctx.modifyTrack(false, track => {
      const lastSegment = track.segments[track.segments.length - 1];
      const lastSegmentNewPoints: PointDescriptor[] = [];
      for (let i = lastSegment.points.length - 2; i >= 0; --i) {
        lastSegmentNewPoints.push(this.copy(lastSegment.points[i]));
      }
      if (lastSegmentNewPoints.length > 0)
        lastSegment.appendMany(lastSegmentNewPoints);
      for (let si = track.segments.length - 2; si >= 0; --si) {
        const newPoints: PointDescriptor[] = [];
        const points = track.segments[si].points;
        for (let pi = points.length - 1; pi >= 0; --pi) {
          newPoints.push(this.copy(points[pi]));
        }
        if (newPoints.length > 0) {
          const segment = track.newSegment();
          segment.appendMany(newPoints);
        }
      }
      return of(true);
    }).subscribe(() => ctx.refreshTools());
  }

  private copy(pt: PointDescriptor): PointDescriptor {
    return {...copyPoint(pt), time: undefined, speed: undefined, heading: undefined};
  }

}
