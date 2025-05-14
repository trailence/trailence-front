import { of } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';

export class JoinArrivalToDeparture implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext) {
    return 'arrival_to_departure.button_label';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    if (ctx.hasSelection()) return false;
    const track = ctx.currentTrack$.value;
    if (!track) return false;
    return !!track.departurePoint && !!track.arrivalPoint && track.departurePoint.distanceTo(track.arrivalPoint.pos) > 1 && track.departurePoint.distanceTo(track.arrivalPoint.pos) < 100;
  }

  execute(ctx: TrackEditToolContext) {
    ctx.modifyTrack(false, track => {
      const segment = track.segments[track.segments.length - 1];
      const departure = track.departurePoint;
      if (!departure) return of(true);
      segment.append({
        pos: {
          lat: departure.pos.lat,
          lng: departure.pos.lng,
        },
        ele: departure.ele,
        time: track.arrivalPoint!.time,
        posAccuracy: departure.posAccuracy,
        eleAccuracy: departure.eleAccuracy
      });
      return of(true);
    }).subscribe(() => ctx.refreshTools());
  }

}
