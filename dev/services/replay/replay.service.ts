import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Track } from 'src/app/model/track';
import { Trail } from 'src/app/model/trail';
import { TrackService } from 'src/app/services/database/track.service';
import { TraceRecorderService } from 'src/app/services/trace-recorder/trace-recorder.service';
import { TrackUtils } from 'src/app/utils/track-utils';

@Injectable({
  providedIn: 'root'
})
export class ReplayService {

  public readonly canReplay = true;

  constructor(
    private readonly trackService: TrackService,
    private readonly traceRecorder: TraceRecorderService,
    private readonly router: Router,
  ) {}

  public replay(trackUuid: string, owner: string, following?: Trail): void {
    this.trackService.getFullTrackReady$(trackUuid, owner).subscribe(track => {
      this.startReplay(track, following);
    });
  }

  private startReplay(track: Track, following?: Trail): void {
    const originalGetCurrentPosition = window.navigator.geolocation.getCurrentPosition;
    const originalWatchPosition = window.navigator.geolocation.watchPosition;
    const originalClearWatch = window.navigator.geolocation.clearWatch;

    window.navigator.geolocation.getCurrentPosition = function(success, error) {
      if (error) error({code: GeolocationPositionError.POSITION_UNAVAILABLE, message: 'Fake!'} as GeolocationPositionError);
    };

    window.navigator.geolocation.clearWatch = function() {
      window.navigator.geolocation.getCurrentPosition = originalGetCurrentPosition;
      window.navigator.geolocation.watchPosition = originalWatchPosition;
      window.navigator.geolocation.clearWatch = originalClearWatch;
    };

    let segmentIndex = 0;
    let pointIndex = 0;
    const sendNextPoint = (success: PositionCallback, error: PositionErrorCallback | null | undefined) => {
      if (segmentIndex >= track.segments.length) return;
      const segment = track.segments[segmentIndex];
      if (pointIndex >= segment.points.length) {
        segmentIndex++;
        pointIndex = 0;
        setTimeout(() => sendNextPoint(success, error), 10);
        return;
      }
      const point = segment.points[pointIndex];
      let time = point.time ?? 0;
      if (pointIndex > 0 && segment.points[pointIndex - 1].time === time) {
        let first = pointIndex - 1;
        while (first > 0 && segment.points[first - 1].time === time) first--;
        let last = pointIndex;
        while (last < segment.points.length - 1 && segment.points[last + 1].time === time) last++;
        const distance = TrackUtils.distanceBetween(segment.points, first, last);
        const pd = TrackUtils.distanceBetween(segment.points, first, pointIndex);
        if (last < segment.points.length - 1) {
          const nextTime = segment.points[last + 1].time;
          if (nextTime)
            time = time + (nextTime - time) / distance * pd;
        } else
          time += (pointIndex - first) * 100;
      }
      success({
        coords: {
          latitude: point.pos.lat,
          longitude: point.pos.lng,
          altitude: point.ele ?? null,
          accuracy: point.posAccuracy ?? 1,
          altitudeAccuracy: point.eleAccuracy ?? null,
          heading: point.heading ?? null,
          speed: point.speed ?? null,
          toJSON: function() {},
        },
        timestamp: time,
        toJSON: function() {},
      });
      pointIndex++;
      setTimeout(() => sendNextPoint(success, error), 150);
    };

    window.navigator.geolocation.watchPosition = function(success, error) {
      setTimeout(() => sendNextPoint(success, error), 5000);
      return 1;
    };

    this.traceRecorder.start(following);
    if (!following)
      this.router.navigateByUrl('/trail');
  }

}
