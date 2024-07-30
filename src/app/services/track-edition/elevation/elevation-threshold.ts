import { Point } from 'src/app/model/point';
import { Segment } from 'src/app/model/segment';
import { Track } from 'src/app/model/track';

export function applyElevationThresholdToTrack(track: Track, threshold: number, maxDistance: number): void {
  for (const segment of track.segments)
    applyElevationThresholdToSegment(segment, threshold, maxDistance, undefined, true);
}

class Cursor {
  previousEle: number | undefined;
  previousPos!: L.LatLng;
  previousIndex = 0;
  currentDistance = 0;

  constructor(
    public points: Point[],
    startIndex: number
  ) {
    this.resetWithIndex(points, startIndex);
  }

  reset(ele: number | undefined, pos: L.LatLng, index: number): void {
    this.previousEle = ele;
    this.previousPos = pos;
    this.previousIndex = index;
    this.currentDistance = 0;
  }

  resetWithIndex(points: Point[], index: number) {
    this.reset(points[index].ele, points[index].pos, index);
  }

  newPoint(pos: L.LatLng, index: number) {
    this.currentDistance += pos.distanceTo(this.points[index - 1].pos);
  }
}

export function applyElevationThresholdToSegment(segment: Segment, threshold: number, maxDistance: number, lastIndexProcessed: number | undefined, finish: boolean): number {
  const points = segment.points;
  if (points.length < 3) return 0;
  const smoothOutsideThreshold = 2;
  const start = lastIndexProcessed ? lastIndexProcessed : 0;
  const cursor = new Cursor(points, start);
  const nb = finish ? points.length : points.length - 10;
  for (let i = start + 1; i < nb - 1; ++i) {
    const ele = points[i].ele;
    const pos = points[i].pos;
    cursor.newPoint(pos, i);
    if (ele !== undefined) {
      if (cursor.previousEle === undefined) {
        cursor.reset(ele, pos, i);
        continue;
      }
      const diff = ele - cursor.previousEle;
      if (diff >= threshold || -diff >= threshold || cursor.currentDistance >= maxDistance) {
        i = smoothElevation(points, cursor.previousIndex, cursor.previousEle, i, diff, cursor.currentDistance, smoothOutsideThreshold);
        cursor.resetWithIndex(points, i);
      }
    }
  }
  if (!finish) return cursor.previousIndex;
  let last = points.length - 2;
  while (points[last].ele === undefined && last > cursor.previousIndex) last--;
  if (cursor.previousIndex < last && cursor.previousEle !== undefined) {
    if (last != nb - 1) {
      cursor.resetWithIndex(points, cursor.previousIndex);
      for (let i = cursor.previousIndex + 1; i <= last; ++i) {
        cursor.newPoint(points[i].pos, i);
      }
    }
    do {
      const ele = points[last].ele!;
      const diff = ele - cursor.previousEle;
      const index = smoothElevation(points, cursor.previousIndex, cursor.previousEle, last, diff, cursor.currentDistance, smoothOutsideThreshold);
      if (index >= last - 1) break;
      cursor.resetWithIndex(points, index);
      for (let i = index + 1; i <= last; ++i) {
        cursor.newPoint(points[i].pos, i);
      }
    } while (cursor.previousIndex < last - 1);
  }
  return Math.max(nb, 0);
}

function smoothElevation(points: Point[], previousIndex: number, previousEle: number, toIndex: number, diff: number, totalDistance: number, smoothOutsideThreshold: number): number {
  const outside = outsideFromSmoothElevation(points, previousIndex, previousEle, toIndex, diff, totalDistance, smoothOutsideThreshold);
  if (outside !== null) {
    applySmoothElevation(points, previousIndex, previousEle, outside.index, points[outside.index].ele! - previousEle, outside.distance);
    return outside.index;
  }
  applySmoothElevation(points, previousIndex, previousEle, toIndex, diff, totalDistance);
  return toIndex;
}

function outsideFromSmoothElevation(points: Point[], previousIndex: number, previousEle: number, toIndex: number, diff: number, totalDistance: number, threshold: number): {index: number, distance: number} | null {
  let currentDistance = 0;
  for (let j = previousIndex + 1; j < toIndex; ++j) {
    currentDistance += points[j].distanceTo(points[j - 1].pos);
    const ele = points[j].ele;
    if (ele !== undefined) {
      const smoothEle = previousEle + (diff * currentDistance / totalDistance);
      const d = Math.abs(ele - smoothEle);
      if (d > threshold) {
        return {index: j, distance: currentDistance};
      }
    }
  }
  return null;
}

function applySmoothElevation(points: Point[], previousIndex: number, previousEle: number, toIndex: number, diff: number, totalDistance: number) {
  let currentDistance = 0;
  for (let j = previousIndex + 1; j < toIndex; ++j) {
    currentDistance += points[j].distanceTo(points[j - 1].pos);
    points[j].ele = previousEle + (diff * currentDistance / totalDistance);
  }
}
