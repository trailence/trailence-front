import { combineLatest, concat, first, map, Observable, of } from 'rxjs';
import { Track } from 'src/app/model/track';
import { TrackWayPoint, TrackWayPointElement } from './track-waypoint';
import { computeWayPointsFromTrack } from './waypoints-from-track';
import { computeBreakPoints } from './breakpoints';
import { extendsAround } from '../leaflet-utils';
import { debounceTimeExtended } from '../rxjs/debounce-time-extended';
import { computeGuidepostsWayPoints, GUIDEPOST_MAX_DISTANCE_FROM_EXISTING_WAYPOINT } from './guideposts';
import { BreakPointSection } from 'src/app/services/track-edition/time/break-detection';
import { computeOsmWayChanges } from './way-intersection';

export function computeTrackWayPoints(track: Track, breaksSections: BreakPointSection[]): Observable<TrackWayPoint[]> {
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
    const pois$ = track.isRecording ? of([]) : concat(of(undefined), track.computed.guidpostsOnTrackBounds$.pipe(map(response => response?.pois)));
    const ways$ = of([[null, null]]);// concat(of(undefined), combineLatest([track.computed.osmWaysOnTrackBounds$, track.computed.osmWaysMatch$]).pipe(first()));
    const estimatedTrackTime$ = track.isRecording ? of(undefined) : concat(of(undefined), track.computed.timeEstimation$.pipe(first()));
    let poisDone = track.isRecording;
    let waysDone = track.isRecording;
    let estimatedTimeDone = track.isRecording;
    combineLatest([pois$, ways$, estimatedTrackTime$]).pipe(debounceTimeExtended(250, 250, undefined, (p,n) => n[0] !== undefined && n[1] !== undefined)).subscribe({
      next: result => {
        const newList = [...list];
        let changed = false;
        if (result[0] && !poisDone) {
          changed = computeGuidepostsWayPoints(track, result[0], newList) || changed;
          poisDone = true;
        }
        if (result[1]?.[1] && !waysDone) {
          //changed = computeOsmWayChanges(track, result[1][1].osmTrackPoints, result[1][0]?.ways || result[1][1].waysOnTrack.values(), newList) || changed;
          waysDone = true;
        }
        if (result[2] && (!estimatedTimeDone || changed)) {
          for (const wp of newList) {
            let estimatedTime: number | undefined;
            const ref = wp.nearestTrackPointReference;
            const pointEstimation = result[2].points.at(ref.segmentIndex)?.at(ref.pointIndex);
            if (pointEstimation) {
              estimatedTime = pointEstimation.estimatedDurationFromStart;
            }
            if (estimatedTime !== wp.estimatedTimeSinceStart) {
              wp.estimatedTimeSinceStart = estimatedTime;
              changed = true;
            }
          }
          estimatedTimeDone = true;
        }
        if (changed) subscriber.next(newList);
      },
      complete: () => {
        subscriber.complete();
      },
    });
  });
}
