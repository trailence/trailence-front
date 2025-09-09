import { Segment } from 'src/app/model/segment';
import { ImprovmentRecordingState } from '../track-edition.service';
import { Track } from 'src/app/model/track';

export function removeBreaksMovesOnTrack(track: Track): void {
  for (const segment of track.segments) {
    removeBreaksMovesOnSegment(segment, new ImprovmentRecordingState(), true);
  }
}

export function removeBreaksMovesOnSegment(segment: Segment, state: ImprovmentRecordingState, finish: boolean): void {
  const points = segment.points;
  if (points.length < 3) return;
  const actualPoint = points[points.length - 1];
  while (state.lastBreaksMovesIndex < points.length) {
    if (state.lastBreaksMovesIndex >= 3) {
      if (!finish && actualPoint.pos.distanceTo(points[state.lastBreaksMovesIndex].pos) <= 30) break;
      removeBreaksMoves(segment, state.lastBreaksMovesIndex, state);
    }
    state.lastBreaksMovesIndex++;
  }
}

function removeBreaksMoves(segment: Segment, pointIndex: number, state: ImprovmentRecordingState): void {
    const points = segment.points;
    const currentPoint = points[pointIndex];
    const currentTime = currentPoint?.time;
    if (!currentTime) return;
    /* If we stay in a 20 meters area since at least 2 minutes
    * we are most probably in a break, so we can keep only one point to remove small moves during break
    */
    let i = pointIndex - 1;
    let latestWithin5Meters = -1;
    while (i >= 0) {
      const distance = points[i].distanceTo(currentPoint.pos);
      if (distance > 20) break;
      if (distance <= 5) latestWithin5Meters = i;
      i--;
    }
    if (latestWithin5Meters < 0) return;
    i = latestWithin5Meters;
    if (i >= pointIndex - 3) return;
    const firstPoint = points[i];
    if (!firstPoint.time || currentTime - firstPoint.time < 120000) return;
    const averagePos = { lat: firstPoint.pos.lat, lng: firstPoint.pos.lng };
    for (let j = i + 1; j <= pointIndex; ++j) {
      averagePos.lat += points[j].pos.lat;
      averagePos.lng += points[j].pos.lng;
    }
    averagePos.lat /= pointIndex - i + 1;
    averagePos.lng /= pointIndex - i + 1;
    let best = i;
    for (let j = i + 1; j <= pointIndex; ++j) {
      if (points[best].pos.distanceTo(averagePos) > points[j].pos.distanceTo(averagePos)) {
        best = j;
      }
    }
    if (best > i) {
      segment.removeMany(points.slice(i, best - 1));
      state.removedPoints(i, best - 1);
    }
    if (best < pointIndex) {
      segment.removeMany(points.slice(best + 1, pointIndex));
      state.removedPoints(best + 1, pointIndex);
    }
  }
