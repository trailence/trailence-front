import { of } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { copyPoint, PointDescriptor } from 'src/app/model/point-descriptor';
import { TrackUtils } from 'src/app/utils/track-utils';

export class StartFromArrival implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext) {
    return 'start_from_arrival';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    const track = ctx.currentTrack$.value;
    if (!track) return false;
    if (!track.departurePoint || !track.arrivalPoint || track.departurePoint.distanceTo(track.arrivalPoint.pos) < 100) return false;
    return !!TrackUtils.findPath(track, track.arrivalPoint.pos, track.departurePoint.pos);
  }

  execute(ctx: TrackEditToolContext) {
    ctx.modifyTrack(false, track => {
      if (track.arrivalPoint && track.departurePoint) {
        const path = TrackUtils.findPath(track, track.arrivalPoint.pos, track.departurePoint.pos);
        if (path)
          track.segments[0].insertMany(0, path.map(p => this.copy(p)));
      }
      return of(true);
    }).subscribe(() => ctx.refreshTools());
  }

  private copy(pt: PointDescriptor): PointDescriptor {
    return {...copyPoint(pt), time: undefined, speed: undefined, heading: undefined};
  }

}
