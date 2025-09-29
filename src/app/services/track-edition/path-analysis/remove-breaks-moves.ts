import { Segment } from 'src/app/model/segment';
import { ImprovmentRecordingState } from '../track-edition.service';
import { Track } from 'src/app/model/track';
import { Point } from 'src/app/model/point';
import { TrackUtils } from 'src/app/utils/track-utils';

export function removeBreaksMovesOnTrack(track: Track): void {
  for (const segment of track.segments) {
    removeBreaksMovesOnSegment(segment, new ImprovmentRecordingState(), true);
  }
}

export function removeBreaksMovesOnSegment(segment: Segment, state: ImprovmentRecordingState, finish: boolean): void {
  while (state.lastBreaksMovesIndex < segment.points.length - 1 && removeBreaksMoves(segment, state, finish));
}

const DISTANCE_BREAK_AREA = 30; // distance within the moves may be analyzed and removed
const MIN_TIME_IN_AREA_FOR_A_BREAK = 120000; // 2 minutes
const TEMPORARY_ADJUST_IGNORE_LAST_POINTS = 5;
const DISTANCE_FINALIZE_AREA = 5;

function removeBreaksMoves(segment: Segment, state: ImprovmentRecordingState, finish: boolean): boolean {
  const points = segment.points;
  if (points.length < 3 || points.length - 1 === state.lastBreaksMovesIndex) return false;

  const currentPoint = points[state.lastBreaksMovesIndex];
  if (currentPoint.time === undefined) {
    // no time info at current point => ignore it and continue
    state.lastBreaksMovesIndex++;
    return true;
  }
  let outsidePointIndex = state.lastBreaksMovesIndex + 1;
  let outsidePoint = points[outsidePointIndex];
  while (outsidePoint.distanceTo(currentPoint.pos) < DISTANCE_BREAK_AREA * 3) {
    outsidePointIndex++;
    if (outsidePointIndex === points.length) break;
    outsidePoint = points[outsidePointIndex];
  }
  if (outsidePointIndex >= points.length && finish) outsidePointIndex = points.length - 1;
  if (outsidePointIndex < points.length) {
    // we totally left the area, we can finish to handle it
    if (TrackUtils.durationBetween(currentPoint, outsidePoint) < MIN_TIME_IN_AREA_FOR_A_BREAK) {
      state.lastBreaksMovesIndex = outsidePointIndex;
      return true;
    }
    // do the temporary adjustements inside this area
    if (outsidePointIndex > state.lastBreaksMovesIndex + 2 && temporarlyAdjustBreaksMovesInArea(segment, state.lastBreaksMovesIndex, outsidePointIndex - 1)) return true;

    // here we are in a DISTANCE_BREAK_AREA * 3 area
    // we need to identify where we stayed in a small area for a long time, to remove those points
    do {
      let startPoint = points[state.lastBreaksMovesIndex];
      let endIndex = state.lastBreaksMovesIndex;
      while (endIndex < outsidePointIndex) {
        let nextPoint = points[endIndex + 1];
        if (nextPoint.distanceTo(startPoint.pos) > DISTANCE_BREAK_AREA) break;
        endIndex++;
      }
      if (TrackUtils.durationBetween(startPoint, points[endIndex]) >= MIN_TIME_IN_AREA_FOR_A_BREAK) {
        const removed = removeBreaksMovesInArea(segment, state.lastBreaksMovesIndex, endIndex, state);
        outsidePointIndex -= removed;
      }
      state.lastBreaksMovesIndex++;
    } while (state.lastBreaksMovesIndex < outsidePointIndex - 2);
    state.lastBreaksMovesIndex = outsidePointIndex;
    return true;
  }
  // we are not yet sure we left the area
  if (TrackUtils.durationBetween(currentPoint, points[points.length - 1]) < MIN_TIME_IN_AREA_FOR_A_BREAK) {
    // not yet enough time to determine we are in a break: let's wait
    return false;
  }
  temporarlyAdjustBreaksMovesInArea(segment, state.lastBreaksMovesIndex, points.length - (finish ? 1 : TEMPORARY_ADJUST_IGNORE_LAST_POINTS));
  return false;
}

function removeBreaksMovesInArea(segment: Segment, startIndex: number, endIndex: number, state: ImprovmentRecordingState): number {
  const points = segment.points;
  let point = points[startIndex];
  let totalLat = 0;
  let totalLng = 0;
  let totalTime = 0;
  for (let i = startIndex + 1; i <= endIndex; ++i) {
    point = points[i];
    const time = point.durationFromPreviousPoint;
    if (time === undefined) continue;
    totalLat += point.pos.lat * time;
    totalLng += point.pos.lng * time;
    totalTime += time;
  }
  if (totalTime === 0) return 0;
  const avgPos = {lat: totalLat / totalTime, lng: totalLng / totalTime};
  // find the first point close from the average
  let firstPointIndex = startIndex;
  let firstPoint = points[startIndex];
  let firstPointDistanceFromAvg = firstPoint.distanceTo(avgPos);
  for (let i = startIndex + 1; i <= endIndex && firstPointDistanceFromAvg > DISTANCE_FINALIZE_AREA; ++i) {
    point = points[i];
    let d = point.distanceTo(avgPos);
    if (d < firstPointDistanceFromAvg) {
      firstPoint = point;
      firstPointDistanceFromAvg = d;
      firstPointIndex = i;
    }
  }
  if (firstPointIndex === endIndex) return 0;
  // find the last point from the average
  let lastPointIndex = endIndex;
  let lastPoint = points[endIndex];
  let lastPointDistanceFromAvg = lastPoint.distanceTo(avgPos);
  for (let i = endIndex - 1; i > firstPointIndex && lastPointDistanceFromAvg > DISTANCE_FINALIZE_AREA; --i) {
    point = points[i];
    let d = point.distanceTo(avgPos);
    if (d < lastPointDistanceFromAvg) {
      lastPoint = point;
      lastPointDistanceFromAvg = d;
      lastPointIndex = i;
    }
  }
  if (lastPointIndex > firstPointIndex + 2) {
    // remove points in between
    segment.removeMany(points.slice(firstPointIndex + 1, lastPointIndex - 1));
    state.removedPoints(firstPointIndex + 1, lastPointIndex - 1);
    return lastPointIndex - (firstPointIndex + 1);
  }
  return 0;
}

function temporarlyAdjustBreaksMovesInArea(segment: Segment, startIndex: number, endIndex: number): boolean {
  const points = segment.points;
  let changed = false;
  for (let i = startIndex; i < endIndex - 2; ++i) {
    const startPoint = points[i];
    if (startPoint.posAccuracy === undefined) continue;
    const nextPoint = points[i + 1];
    if (nextPoint.posAccuracy !== undefined && nextPoint.posAccuracy < startPoint.posAccuracy) {
      // next point seems better, so do not take the start point as a reference
      continue;
    }
    const nextDistance = nextPoint.distanceTo(startPoint.pos);
    for (let j = i + 2; j < endIndex; ++j) {
      const otherPoint = points[j];
      if (otherPoint.posAccuracy === undefined) continue;
      const otherDistance = otherPoint.distanceTo(startPoint.pos);
      if (otherDistance < nextDistance) {
        // nextPoint was going out from startPoint
        // but otherPoint went back closer from startPoint
        // if we have a similar accuracy and we have points in between with low accuracy, let's adjust them
        if (Math.abs(startPoint.posAccuracy - otherPoint.posAccuracy) <= 3) {
          for (let k = i + 1; k < j; ++k) {
            const point = points[k];
            if (point.posAccuracy === undefined || point.posAccuracy > startPoint.posAccuracy + 3) {
              // accuracy looks lower, let's set the position to the previous point
              point.pos = points[k - 1].pos;
              point.posAccuracy = points[k - 1].posAccuracy;
              changed = true;
            }
          }
        }
      }
    }
  }
  return changed;
}
