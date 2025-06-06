import { PointDescriptor } from 'src/app/model/point';
import { Segment } from 'src/app/model/segment';
import { Track } from 'src/app/model/track';
import { TrackUtils } from 'src/app/utils/track-utils';
import * as L from 'leaflet';

export function applyElevationThresholdToTrack(track: Track, threshold: number, maxDistance: number): void {
  for (const segment of track.segments)
    applyElevationThresholdToSegment(segment, threshold, maxDistance, undefined, segment.points.length - 1, true);
}

class Cursor {
  previousEle: number | undefined;
  previousPos!: L.LatLng | L.LatLngLiteral;
  previousIndex = 0;
  currentDistance = 0;

  constructor(
    public points: PointDescriptor[],
    startIndex: number
  ) {
    this.resetWithIndex(points, startIndex);
  }

  reset(ele: number | undefined, pos: L.LatLng | L.LatLngLiteral, index: number): void {
    this.previousEle = ele;
    this.previousPos = pos;
    this.previousIndex = index;
    this.currentDistance = 0;
  }

  resetWithIndex(points: PointDescriptor[], index: number) {
    this.reset(points[index].ele, points[index].pos, index);
  }

  newPoint(pos: L.LatLng | L.LatLngLiteral, index: number) {
    const p = pos instanceof L.LatLng ? pos : L.latLng(pos.lat, pos.lng);
    this.currentDistance += p.distanceTo(this.points[index - 1].pos);
  }
}

export function applyElevationThresholdToSegment(segment: Segment, threshold: number, maxDistance: number, lastIndexProcessed: number | undefined, maxIndexToProcess: number, finish: boolean): number { // NOSONAR
  return applyElevationThresholdToPoints(segment.points, threshold, maxDistance, lastIndexProcessed, maxIndexToProcess, finish);
}

export function applyElevationThresholdToPoints(points: PointDescriptor[], threshold: number, maxDistance: number, lastIndexProcessed: number | undefined, maxIndexToProcess: number, finish: boolean): number { // NOSONAR
  if (points.length < 3) return 0;
  const smoothOutsideThreshold = threshold * 0.75;
  const start = lastIndexProcessed ?? 0;
  const cursor = new Cursor(points, start);
  const endIndex = finish ? points.length - 1 : maxIndexToProcess;
  for (let i = start + 1; i <= endIndex - 1; ++i) {
    const ele = points[i].ele;
    const pos = points[i].pos;
    cursor.newPoint(pos, i);
    if (ele === undefined) continue;
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
  if (!finish) return cursor.previousIndex;
  let last = points.length - 2;
  while (points[last].ele === undefined && last > cursor.previousIndex) last--;
  if (cursor.previousIndex < last && cursor.previousEle !== undefined) {
    if (last != endIndex) {
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
  return Math.max(endIndex, 0);
}

function smoothElevation(points: PointDescriptor[], previousIndex: number, previousEle: number, toIndex: number, diff: number, totalDistance: number, smoothOutsideThreshold: number): number {
  const outside = outsideFromSmoothElevation(points, previousIndex, previousEle, toIndex, diff, totalDistance, smoothOutsideThreshold);
  if (outside !== null) {
    return applySmoothElevation(points, previousIndex, previousEle, outside.index, points[outside.index].ele! - previousEle, outside.distance);
  }
  return applySmoothElevation(points, previousIndex, previousEle, toIndex, diff, totalDistance);
}

function outsideFromSmoothElevation(points: PointDescriptor[], previousIndex: number, previousEle: number, toIndex: number, diff: number, totalDistance: number, threshold: number): {index: number, distance: number} | null {
  let currentDistance = 0;
  let distanceAbove = 0;
  let distanceBelow = 0;
  for (let j = previousIndex + 1; j < toIndex; ++j) {
    const dist = TrackUtils.getDistanceFromPreviousPoint(points, j);
    currentDistance += dist;
    const ele = points[j].ele;
    if (ele === undefined) continue;
    const smoothEle = previousEle + (diff * currentDistance / totalDistance);
    const smoothDiff = ele - smoothEle;
    if (smoothDiff > threshold / 10) distanceAbove += dist;
    else if (smoothDiff < -(threshold / 10)) distanceBelow += dist;
    const stop = (currentDistance > totalDistance / 3 && currentDistance > 100 && (distanceAbove > currentDistance * 0.4 || distanceBelow > currentDistance * 0.4)) ||
      (Math.abs(smoothDiff) > threshold);
    if (stop) {
      const newOutside = outsideFromSmoothElevation(points, previousIndex, previousEle, j, points[j].ele! - previousEle, currentDistance, threshold);
      if (newOutside) return newOutside;
      return {index: j, distance: currentDistance};
    }
  }
  return null;
}

function applySmoothElevation(points: PointDescriptor[], previousIndex: number, previousEle: number, toIndex: number, diff: number, totalDistance: number): number {
  if (previousIndex > 0) {
    const ppEle = points[previousIndex - 1].ele;
    if (ppEle !== undefined &&
      ((previousEle - ppEle > 0 && diff < 0) || (previousEle - ppEle < 0 && diff > 0)) && // change of elevation way
      (totalDistance > 50 && toIndex - previousIndex > 3)
    ) {
      // let's take a middle point first
      const middle = Math.floor(previousIndex + (toIndex - previousIndex) / 2);
      const middleEle = points[middle].ele;
      if (middleEle !== undefined) {
        applyFinalSmoothElevation(points, previousIndex, previousEle, middle, middleEle - previousEle, TrackUtils.distanceBetween(points, previousIndex, middle));
        return middle;
      }
    }
  }
  applyFinalSmoothElevation(points, previousIndex, previousEle, toIndex, diff, totalDistance);
  return toIndex;
}

function applyFinalSmoothElevation(points: PointDescriptor[], previousIndex: number, previousEle: number, toIndex: number, diff: number, totalDistance: number) {
  let currentDistance = 0;
  for (let j = previousIndex + 1; j < toIndex; ++j) {
    currentDistance += TrackUtils.getDistanceFromPreviousPoint(points, j);
    points[j].ele = previousEle + (diff * currentDistance / totalDistance);
  }
}
