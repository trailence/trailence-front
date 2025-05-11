import { Point } from 'src/app/model/point';
import { Segment } from 'src/app/model/segment';
import { Track } from 'src/app/model/track';
import { TrackUtils } from 'src/app/utils/track-utils';

export function adjustUnprobableElevationToTrackBasedOnGrade(track: Track): void {
  for (const segment of track.segments)
    adjustUnprobableElevationToSegmentBasedOnGrade(segment, undefined, true);
}

const MAX_DISTANCE = 150;
const MIN_POINTS = 75;
const UNPROBABLE_MIN_GRADE = 0.35;

export function adjustUnprobableElevationToSegmentBasedOnGrade(segment: Segment, lastIndex: number | undefined, finish: boolean): number {
  const points = segment.points;
  // start from first point having elevation
  let startIndex = TrackUtils.nextPointIndexWithElevation(points, (lastIndex ?? 0) - 1);
  if (startIndex < 0) return 0;

  let endIndex: number;
  if (!finish) {
    // do not use the last MAX_DISTANCE meters / MIN_POINTS
    endIndex = Math.max(0, Math.min(points.length - MIN_POINTS - 1, TrackUtils.goBackUntilDistance(points, points.length - 1, startIndex, MAX_DISTANCE)));
  } else {
    endIndex = points.length - 1;
  }
  if (endIndex <= startIndex + 1) return startIndex;

  if (TrackUtils.isDistanceBetweenPointsLessThan(points, startIndex, endIndex, MAX_DISTANCE)) return startIndex;

  const previousPointCursor = {
    index: startIndex,
    ele: points[startIndex].ele!,
    distanceSince: 0,
  } as Cursor;

  for (let i = startIndex + 1; i <= endIndex; ++i) {
    const e = points[i].ele;
    previousPointCursor.distanceSince += points[i].distanceFromPreviousPoint;
    if (e === undefined || previousPointCursor.distanceSince === 0) continue;
    const grade = (e - previousPointCursor.ele) / previousPointCursor.distanceSince;
    const absGrade = Math.abs(grade);
    if (absGrade < UNPROBABLE_MIN_GRADE) { // acceptable
      previousPointCursor.ele = e;
      previousPointCursor.index = i;
      previousPointCursor.distanceSince = 0;
      continue;
    }
    // we have an unprobable grade at i
    // search in the next few points if we go back to almost the same elevation
    let j = searchCloseElevationInNextPoints(points, i + 1, Math.min(endIndex, i + MIN_POINTS), previousPointCursor, absGrade);
    if (j > 0) {
      i = j;
    }
  }
  return previousPointCursor.index;
}

interface Cursor {
  index: number;
  ele: number;
  distanceSince: number;
}

function searchCloseElevationInNextPoints(points: Point[], startIndex: number, endIndex: number, startCursor: Cursor, badAbsGrade: number): number {
  let distance = startCursor.distanceSince;
  let bestPointIndex = -1;
  let bestPointElevationDiff = 0;
  let bestPointDistance = 0;
  for (let i = startIndex; i <= endIndex; ++i) {
    const e = points[i].ele;
    distance += points[i].distanceFromPreviousPoint;
    if (distance > MAX_DISTANCE) break;
    if (e === undefined || distance === 0) continue;
    const grade = (e - startCursor.ele) / distance;
    const absGrade = Math.abs(grade);
    if (absGrade < badAbsGrade) {
      const eleDiff = Math.abs(e - startCursor.ele);
      if (bestPointIndex < 0 || eleDiff < bestPointElevationDiff) {
        bestPointIndex = i;
        bestPointElevationDiff = eleDiff;
        bestPointDistance = distance;
      }
    }
  }
  if (bestPointIndex > 0) {
    adjustElevation(points, startCursor.index, bestPointIndex, bestPointDistance);
    startCursor.index = bestPointIndex;
    startCursor.ele = points[bestPointIndex].ele!;
    startCursor.distanceSince = 0;
  }
  return bestPointIndex;
}

function adjustElevation(points: Point[], startIndex: number, endIndex: number, distance: number): void {
  let eleAccuracy = points[startIndex].eleAccuracy;
  for (let i = startIndex + 1; i <= endIndex; ++i)
    if (points[i].eleAccuracy !== undefined && (eleAccuracy === undefined || points[i].eleAccuracy! > eleAccuracy))
      eleAccuracy = points[i].eleAccuracy;
  let startEle = points[startIndex].ele!;
  let endEle = points[endIndex].ele!;
  let d = 0;
  for (let i = startIndex + 1; i < endIndex; ++i) {
    d += points[i].distanceFromPreviousPoint;
    points[i].ele = startEle + ((endEle - startEle) / distance * d);
    points[i].eleAccuracy = eleAccuracy;
  }
}
