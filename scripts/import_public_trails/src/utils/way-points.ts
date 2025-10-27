import { PointDescriptor } from 'front/model/point-descriptor';
import { WayPoint } from 'front/model/way-point';
import { distance } from './crs';

interface PointReference {
  segmentIndex: number;
  pointIndex: number;
}

export function fixWayPointsPosition(wayPoints: WayPoint[], track: PointDescriptor[][]) {
  if (wayPoints.length === 0) return;
  const references = findBestWayPointsPositions(wayPoints, track, 0, {segmentIndex: 0, pointIndex: 0});
  if (references) {
    for (let i = 0; i < references.length; ++i) {
      setPoint(track[references[i].segmentIndex][references[i].pointIndex], wayPoints[i].point);
    }
  }
}

function findBestWayPointsPositions(wayPoints: WayPoint[], track: PointDescriptor[][], wayPointIndex: number, from: PointReference): PointReference[] | undefined {
  const closest = findClosestPoints(wayPoints[wayPointIndex].point.pos, track, from.segmentIndex, from.pointIndex);
  if (closest.length === 0) return undefined;
  if (closest.length === 1) {
    if (wayPointIndex === wayPoints.length - 1) return closest;
    const next = findBestWayPointsPositions(wayPoints, track, wayPointIndex + 1, closest[0]);
    if (next) return [closest[0], ...next];
    return [closest[0]];
  }
  if (wayPointIndex === wayPoints.length - 1) return [closest[0]];
  let best: PointReference[] = [];
  for (const possibility of closest) {
    const next = findBestWayPointsPositions(wayPoints, track, wayPointIndex + 1, possibility);
    if (next) {
      if (next.length === wayPoints.length - (wayPointIndex + 1)) return [possibility, ...next];
      if (best.length < next.length) best = next;
    }
  }
  if (best.length > 0) return best;
  return undefined;
}

function setPoint(from: PointDescriptor, to: PointDescriptor) {
  to.pos = from.pos;
  to.ele = from.ele;
}

function findClosestPoints(pos: {lat: number, lng: number}, track: PointDescriptor[][], fromSegmentIndex: number, fromPointIndex: number): PointReference[] {
  const result: PointReference[] = [];
  do {
    const next = findNextBestPoint(pos, track, fromSegmentIndex, fromPointIndex);
    if (!next) break;
    result.push(next.closest);
    if (!next.next) break;
    fromSegmentIndex = next.next.segmentIndex;
    fromPointIndex = next.next.pointIndex;
  } while (true);
  return result;
}

function findNextBestPoint(pos: {lat: number, lng: number}, track: PointDescriptor[][], fromSegmentIndex: number, fromPointIndex: number): {closest: PointReference, next: PointReference | undefined} | undefined {
  let best: PointReference | undefined;
  let bestDistance = 0;
  for (let si = fromSegmentIndex; si < track.length; si++) {
    if (best) {
      return {closest: best, next: {segmentIndex: si, pointIndex: 0}};
    }
    for (let pi = si === fromSegmentIndex ? fromPointIndex : 0; pi < track[si].length; pi++) {
      const d = distance(pos, track[si][pi].pos);
      if (d < 100) {
        if (!best || d < bestDistance) {
          best = {segmentIndex: si, pointIndex: pi};
          bestDistance = d;
        }
      } else {
        if (best) return {closest: best, next: {segmentIndex: si, pointIndex: pi}};
      }
    }
  }
  if (best) return {closest: best, next: undefined};
  return undefined;
}
