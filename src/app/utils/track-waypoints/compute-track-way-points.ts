import { combineLatest, concat, filter, map, Observable, of, tap } from 'rxjs';
import { Track } from 'src/app/model/track';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';
import { TrackWayPoint, TrackWayPointElement } from './track-waypoint';
import { computeWayPointsFromTrack } from './waypoints-from-track';
import { computeBreakPoints } from './breakpoints';
import { extendsAround } from '../leaflet-utils';
import { Way } from 'src/app/services/map/way';
import { debounceTimeExtended } from '../rxjs/debounce-time-extended';
import { computeGuidepostsWayPoints } from './guideposts';
import { BreakPointSection } from 'src/app/services/track-edition/time/break-detection';

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
    bounds = extendsAround(bounds, 26);
    const pois$ = mapService.pois.getPois(bounds, ['guidepost']).pipe(filter(p => p.done), map(p => p.pois));
    const allWays: Way[] = [];
    const ways$ = mapService.ways.getWays(bounds).pipe(
      tap(response => allWays.push(...response.ways)),
      filter(response => response.done),
      map(() => allWays), // TODO switchMap with attached ways
    );
    let poisDone = false;
    let waysDone = false;
    combineLatest([concat(of(undefined), pois$), concat(of(undefined), ways$)]).pipe(debounceTimeExtended(250, 250, undefined, (p,n) => n[0] !== undefined && n[1] !== undefined)).subscribe({
      next: result => {
        const newList = [...list];
        let changed = false;
        if (result[0] && !poisDone) {
          changed = computeGuidepostsWayPoints(track, result[0], newList) || changed;
          poisDone = true;
        }
        if (result[1] && !waysDone) {
          // TODO
        }
        if (changed) subscriber.next(newList);
      },
      complete: () => {
        subscriber.complete();
      },
    });
  });
}
