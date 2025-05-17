import { of } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';

export class JoinDepartureToArrival implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext) {
    return 'departure_to_arrival.button_label';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    if (ctx.selection.hasSelection()) return false;
    const track = ctx.currentTrack$.value;
    if (!track) return false;
    return !!track.departurePoint && !!track.arrivalPoint && track.departurePoint.distanceTo(track.arrivalPoint.pos) > 1 && track.departurePoint.distanceTo(track.arrivalPoint.pos) < 100;
  }

  execute(ctx: TrackEditToolContext) {
    ctx.modifyTrack(false, track => {
      const segment = track.segments[0];
      const arrival = track.arrivalPoint;
      if (!arrival) return of(true);
      segment.insert(0, {
        pos : {
          lat: arrival.pos.lat,
          lng: arrival.pos.lng,
        },
        ele: arrival.ele,
        time: track.departurePoint!.time,
        posAccuracy: arrival.posAccuracy,
        eleAccuracy: arrival.eleAccuracy,
      });
      return of(true);
    }).subscribe(() => ctx.refreshTools());
  }

}
