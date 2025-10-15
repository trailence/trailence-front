import { Segment } from 'src/app/model/segment';
import { ImprovmentRecordingState } from '../track-edition.service';
import { Track } from 'src/app/model/track';
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
const MIN_TIME_IN_AREA_FOR_A_BREAK = 2 * 60000; // 2 minutes
const TEMPORARY_ADJUST_IGNORE_LAST_POINTS = 5;
const DISTANCE_FINALIZE_AREA = 5;

function removeBreaksMoves(segment: Segment, state: ImprovmentRecordingState, finish: boolean): boolean { // NOSONAR
  const points = segment.points;
  const lastPointIndex = finish ? points.length - 1 : points.length - TEMPORARY_ADJUST_IGNORE_LAST_POINTS
  if (points.length < 3 || state.lastBreaksMovesIndex >= lastPointIndex) return false;

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
    if (outsidePointIndex > lastPointIndex) break;
    outsidePoint = points[outsidePointIndex];
  }
  if (outsidePointIndex >= points.length && finish) outsidePointIndex = points.length - 1;
  if (outsidePointIndex <= lastPointIndex) {
    // we totally left the area, we can finish to handle it
    if (TrackUtils.durationBetween(currentPoint, points[outsidePointIndex]) < MIN_TIME_IN_AREA_FOR_A_BREAK) {
      cleanSamePositionSuccessivePoints(segment, Math.max(0, state.lastBreaksMovesIndex - 5), state.lastBreaksMovesIndex, state);
      state.lastBreaksMovesIndex++;
      return true;
    }
    // do the temporary adjustements inside this area
    if (outsidePointIndex > state.lastBreaksMovesIndex + 2 && temporarlyAdjustBreaksMovesInArea(segment, state.lastBreaksMovesIndex, outsidePointIndex - 1)) return true;

    // here we are in a DISTANCE_BREAK_AREA * 3 area
    // we need to identify where we stayed in a small area for a long time, to remove those points
    let bestStart = undefined;
    let bestEnd = undefined;
    let bestTime = undefined;
    for (let startIndex = state.lastBreaksMovesIndex; startIndex < outsidePointIndex; ++startIndex) {
      const startPoint = points[startIndex];
      let endIndex = startIndex + 1;
      while (endIndex < outsidePointIndex) {
        let nextPoint = points[endIndex + 1];
        if (nextPoint.distanceTo(startPoint.pos) > DISTANCE_BREAK_AREA) break;
        endIndex++;
      }
      if (endIndex >= outsidePointIndex - 1) break;
      const time = TrackUtils.durationBetween(startPoint, points[endIndex + 1]);
      if (time < MIN_TIME_IN_AREA_FOR_A_BREAK) continue;
      if (bestTime === undefined || time > bestTime) {
        bestTime = time;
        bestStart = startIndex;
        bestEnd = endIndex;
      }
    }
    if (bestTime === undefined) {
      cleanSamePositionSuccessivePoints(segment, Math.max(0, state.lastBreaksMovesIndex - 5), state.lastBreaksMovesIndex, state);
      state.lastBreaksMovesIndex++;
      return true;
    }
    const removed = removeBreaksMovesInArea(segment, bestStart!, bestEnd!, state); // NOSONAR
    let previousIndex = state.lastBreaksMovesIndex;
    if (removed === 0) state.lastBreaksMovesIndex++; else state.lastBreaksMovesIndex = Math.max(bestEnd! - 1 - removed, state.lastBreaksMovesIndex + 1); // NOSONAR
    cleanSamePositionSuccessivePoints(segment, Math.max(0, previousIndex - 5), state.lastBreaksMovesIndex, state);
    return true;
  }
  // we are not yet sure we left the area
  if (TrackUtils.durationBetween(currentPoint, points[lastPointIndex]) < MIN_TIME_IN_AREA_FOR_A_BREAK) {
    // not yet enough time to determine we are in a break: let's wait
    return false;
  }
  temporarlyAdjustBreaksMovesInArea(segment, state.lastBreaksMovesIndex, lastPointIndex);
  return false;
}

function removeBreaksMovesInArea(segment: Segment, startIndex: number, endIndex: number, state: ImprovmentRecordingState): number { // NOSONAR
  const points = segment.points;
  let point = points[startIndex];
  let totalLat = 0;
  let totalLng = 0;
  let totalTime = 0;
  let longestTime = 0;
  let longestPoint = undefined;
  for (let i = startIndex + 1; i <= endIndex; ++i) {
    const nextPoint = points[i];
    const time = nextPoint.durationFromPreviousPoint;
    if (time === undefined) continue;
    if (time > longestTime) {
      longestTime = time;
      longestPoint = point;
    }
    totalLat += point.pos.lat * time;
    totalLng += point.pos.lng * time;
    totalTime += time;
    point = nextPoint;
  }
  if (totalTime === 0) return 0;
  // average position, or point we spent at least 2/3 of the total time
  const avgPos = longestTime > totalTime * 2 / 3 ? longestPoint!.pos : {lat: totalLat / totalTime, lng: totalLng / totalTime}; // NOSONAR
  // find the first point close from the average
  let firstPointIndex = startIndex;
  let firstPointDistanceFromAvg = points[startIndex].distanceTo(avgPos);
  for (let i = startIndex + 1; i <= endIndex && firstPointDistanceFromAvg > DISTANCE_FINALIZE_AREA; ++i) {
    point = points[i];
    let d = point.distanceTo(avgPos);
    if (d < firstPointDistanceFromAvg) {
      firstPointDistanceFromAvg = d;
      firstPointIndex = i;
    }
  }
  if (firstPointIndex === endIndex) return 0;
  // find the last point from the average
  let lastPointIndex = endIndex;
  let lastPointDistanceFromAvg = points[endIndex].distanceTo(avgPos);
  for (let i = endIndex - 1; i > firstPointIndex && lastPointDistanceFromAvg > DISTANCE_FINALIZE_AREA; --i) {
    point = points[i];
    let d = point.distanceTo(avgPos);
    if (d < lastPointDistanceFromAvg) {
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

function temporarlyAdjustBreaksMovesInArea(segment: Segment, startIndex: number, endIndex: number): boolean { // NOSONAR
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
              point.ele = points[k - 1].ele;
              point.eleAccuracy = points[k - 1].eleAccuracy;
              changed = true;
            }
          }
        }
      }
    }
  }
  return changed;
}

function cleanSamePositionSuccessivePoints(segment: Segment, startIndex: number, endIndex: number, state: ImprovmentRecordingState) {
  for (let i = startIndex; i < endIndex; ++i) {
    const p1 = segment.points[i];
    let j = i + 1;
    while (j <= endIndex) {
      const p2 = segment.points[j];
      if (p2.pos.lat !== p1.pos.lat || p2.pos.lng !== p1.pos.lng) break;
      j++;
    }
    if (j > i + 1) {
      segment.removeMany(segment.points.slice(i + 1, j));
      state.removedPoints(i + 1, j);
      endIndex -= j - (i + 1);
    }
  }
}
