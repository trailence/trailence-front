import { combineLatest, concat, filter, first, map, Observable, of, tap } from 'rxjs';
import { Track } from 'src/app/model/track';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';
import { TrackWayPoint, TrackWayPointElement } from './track-waypoint';
import { computeWayPointsFromTrack } from './waypoints-from-track';
import { computeBreakPoints } from './breakpoints';
import { extendsAround } from '../leaflet-utils';
import { debounceTimeExtended } from '../rxjs/debounce-time-extended';
import { computeGuidepostsWayPoints, GUIDEPOST_MAX_DISTANCE_FROM_EXISTING_WAYPOINT } from './guideposts';
import { BreakPointSection } from 'src/app/services/track-edition/time/break-detection';
import { computeOsmWayChanges } from './way-intersection';

export function computeTrackWayPoints(track: Track, breaksSections: BreakPointSection[], mapService: OfflineMapService): Observable<TrackWayPoint[]> {
  return new Observable<TrackWayPoint[]>(subscriber => {
    const fromTrack = computeWayPointsFromTrack(track);
    const breaks = computeBreakPoints(track, breaksSections);
    const merged = [...fromTrack, ...breaks].sort(TrackWayPointElement.compare);
    const list = merged.map(e => new TrackWayPoint(e));
    subscriber.next(list);
    let bounds = track.metadata.bounds;
    if (!bounds) {
      subscriber.complete();
      return;
    }
    bounds = extendsAround(bounds, GUIDEPOST_MAX_DISTANCE_FROM_EXISTING_WAYPOINT + 1);
    const pois$ = track.isRecording ? of([]) : mapService.pois.getPois(bounds, ['guidepost']).pipe(filter(p => p.done), map(p => p.pois)); // TODO put in track computed data to avoid recomputing each time ?
    const ways$ = of([]);// track.computed.osmWays$.pipe(first());
    let poisDone = track.isRecording;
    let waysDone = track.isRecording;
    combineLatest([concat(of(undefined), pois$), concat(of(undefined), ways$)]).pipe(debounceTimeExtended(250, 250, undefined, (p,n) => n[0] !== undefined && n[1] !== undefined)).subscribe({
      next: result => {
        const newList = [...list];
        let changed = false;
        if (result[0] && !poisDone) {
          changed = computeGuidepostsWayPoints(track, result[0], newList) || changed;
          poisDone = true;
        }
        if (result[1] && !waysDone) {
          //changed = computeOsmWayChanges(track, result[1].osmTrackPoints, result[1].allWays, newList) || changed;
          waysDone = true;
        }
        if (changed) subscriber.next(newList);
      },
      complete: () => {
        subscriber.complete();
      },
    });
  });
}
