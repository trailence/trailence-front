import { Segment } from 'src/app/model/segment';
import { ImprovmentRecordingState } from '../track-edition.service';
import { Track } from 'src/app/model/track';

export function removeUnprobablePointsOnTrack(track: Track): void {
  for (const segment of track.segments) {
    removeUnprobablePointsBasedOnAccuracyOnSegment(segment, new ImprovmentRecordingState());
    removeUnprobablePointsBasedOnBigMovesOnShortTimeOnSegment(segment, new ImprovmentRecordingState());
  }
}

export function removeUnprobablePointsBasedOnAccuracyOnSegment(segment: Segment, state: ImprovmentRecordingState): void {
  while (state.lastRemovedPointBasedOnAccuracy < segment.points.length) {
    if (state.lastRemovedPointBasedOnAccuracy >= 3)
      removeUnprobablePointsBasedOnAccuracy(segment, state.lastRemovedPointBasedOnAccuracy, state);
    state.lastRemovedPointBasedOnAccuracy++;
  }
}

function removeUnprobablePointsBasedOnAccuracy(segment: Segment, pointIndex: number, state: ImprovmentRecordingState): void {
  const points = segment.points;
  const latestPoint = points[pointIndex];
  if (latestPoint.posAccuracy === undefined) return;
  for (let i = pointIndex - 1; i >= 0 && i > pointIndex - 10; --i) {
    const point = points[i];
    if (point.posAccuracy === undefined) continue;
    if (point.posAccuracy > latestPoint.posAccuracy * 1.5) {
      const distance = point.distanceTo(latestPoint.pos);
      let found = false;
      for (let j = i - 1; j >= 0 && j > pointIndex - 15; --j) {
        const point2 = points[j];
        if (point2.posAccuracy === undefined) continue;
        const distance2 = point2.distanceTo(latestPoint.pos);
        if (point2.posAccuracy <= latestPoint.posAccuracy * 1.25 && distance2 < distance * 0.95) {
          found = true;
          break;
        }
      }
      if (!found) return;
      segment.removePointAt(i);
      state.removedPoints(i, i);
      i++;
    }
  }
}


export function removeUnprobablePointsBasedOnBigMovesOnShortTimeOnSegment(segment: Segment, state: ImprovmentRecordingState): void {
  while (state.lastRemovedPointBasedOnBigMovesOnShortTime < segment.points.length) {
    if (state.lastRemovedPointBasedOnBigMovesOnShortTime >= 3)
      removeUnprobablePointsBasedOnBigMovesOnShortTime(segment, state.lastRemovedPointBasedOnBigMovesOnShortTime, state);
    state.lastRemovedPointBasedOnBigMovesOnShortTime++;
  }
}

function removeUnprobablePointsBasedOnBigMovesOnShortTime(segment: Segment, pointIndex: number, state: ImprovmentRecordingState): void {
    const points = segment.points;
    const latestPoint = points[pointIndex];
    if (latestPoint.time === undefined || latestPoint.distanceFromPreviousPoint <= 20 || latestPoint.durationFromPreviousPoint === undefined) return;
    for (let i = pointIndex - 3; i >= 0; --i) {
      const point = points[i];
      if (point.time === undefined) break;
      const t = points[i + 1].time;
      if (t === undefined || latestPoint.time - t > 15000) break;
      if (point.distanceTo(latestPoint.pos) <= 20) {
        // remove points between i + 1 and the latest
        segment.removeMany(points.slice(i + 1, pointIndex));
        state.removedPoints(i + 1, pointIndex);
        break;
      }
    }
  }
