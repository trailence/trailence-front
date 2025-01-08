import { Point } from '../model/point';
import L from 'leaflet';
import { Track } from '../model/track';
import { Segment } from '../model/segment';

export class TrackUtils {

  // Elevation utilities

  public static elevationGrade(points: Point[], pointIndex: number): {gradeBefore: number | undefined, gradeAfter: number | undefined} {
    const pt = points[pointIndex];
    const pte = pt.ele;
    const result: {gradeBefore: number | undefined, gradeAfter: number | undefined} = {gradeBefore: undefined, gradeAfter: undefined};
    if (pte === undefined) return result;
    let previousEle: number | undefined;
    let previousEleDistance: number | undefined;
    let nextEle: number | undefined;
    let nextEleDistance: number | undefined;
    for (let i = pointIndex - 1; i >= 0; --i) {
      const p = points[i];
      const e = p.ele;
      if (e !== undefined) {
        previousEle = e;
        previousEleDistance = pt.distanceTo(p.pos);
        break;
      }
    }
    for (let i = pointIndex + 1; i < points.length; ++i) {
      const p = points[i];
      const e = p.ele;
      if (e !== undefined) {
        nextEle = e;
        nextEleDistance = pt.distanceTo(p.pos);
        break;
      }
    }
    if (previousEle !== undefined) {
      result.gradeBefore = (pte - previousEle) / previousEleDistance!;
    }
    if (nextEle !== undefined) {
      result.gradeAfter = (nextEle - pte) / nextEleDistance!;
    }
    return result;
  }

  public static previousPointIndexWithElevation(points: Point[], index: number): number {
    for (let i = index - 1; i >= 0; --i) {
      if (points[i].ele !== undefined) return i;
    }
    return -1;
  }

  public static nextPointIndexWithElevation(points: Point[], index: number): number {
    for (let i = index + 1; i < points.length; ++i) {
      if (points[i].ele !== undefined) return i;
    }
    return -1;
  }

  // Distance utilities

  public static distanceBetween(points: Point[], startIndex: number, endIndex: number): number {
    let total = 0;
    for (let i = startIndex + 1; i <= endIndex; ++i) {
      total += points[i].distanceFromPreviousPoint;
    }
    return total;
  }

  public static distanceBetweenPoints(segments: Segment[], startSegment: number, startPoint: number, endSegment: number, endPoint: number): number {
    let total = 0;
    for (let i = startSegment + 1; i < endSegment; ++i) total += segments[i].computeTotalDistance();
    if (startSegment < endSegment) {
      return segments[startSegment].distanceToSegmentEnd(startPoint) + segments[endSegment].distanceFromSegmentStart(endPoint);
    } else {
      return segments[startSegment].distanceBetween(startPoint, endPoint);
    }
  }

  public static goBackUntilDistance(points: Point[], index: number, minIndex: number, maxDistance: number): number {
    if (index >= points.length || index < minIndex) return -1;
    let d = 0;
    for (let i = index - 1; i >= minIndex; i--) {
      d += points[i + 1].distanceFromPreviousPoint;
      if (d >= maxDistance) return i;
    }
    return -1;
  }

  public static isDistanceBetweenPointsLessThan(points: Point[], startIndex: number, endIndex: number, maxDistance: number): boolean {
    let d = 0;
    for (let i = startIndex + 1; i <= endIndex; ++i) {
      d += points[i].distanceFromPreviousPoint;
      if (d >= maxDistance) return false;
    }
    return true;
  }

  public static findClosestPoint(pos: L.LatLngLiteral, points: L.LatLngLiteral[], maxDistance: number = -1): number {
    if (points.length === 0) return -1;
    let closestIndex = -1;
    let closestDistance = -1;
    const p = L.latLng(pos);
    for (let i = 0; i < points.length; ++i) {
      const p2 = points[i];
      if (p.lat === p2.lat && p.lng === p2.lng) return i;
      const d = p.distanceTo(p2);
      if (d <= 0.1) return i;
      if ((maxDistance < 0 || d <= maxDistance) && (closestDistance === -1 || d < closestDistance)) {
        closestIndex = i;
        closestDistance = d;
      }
    }
    return closestIndex;
  }

  public static findLastClosePointInTrack(pos: L.LatLngLiteral, track: Track, maxDistance: number): {segmentIndex: number, pointIndex: number} | undefined {
    let closestIndex: {segmentIndex: number, pointIndex: number} | undefined = undefined;
    let closestDistance = -1;
    const p = L.latLng(pos);
    let segmentIndex = 0;
    for (const segment of track.segments) {
      let pointIndex = 0;
      for (const point of segment.points) {
        const d = p.distanceTo(point.pos);
        if (d <= maxDistance && (closestDistance === -1 || d < closestDistance || segmentIndex > closestIndex!.segmentIndex || pointIndex > closestIndex!.pointIndex + 25)) {
          closestIndex = {segmentIndex, pointIndex};
          closestDistance = d;
        }
        pointIndex++;
      }
      segmentIndex++;
    }
    return closestIndex;
  }

  public static findClosestPointForTime(track: Track, time: number): Point | undefined { // NOSONAR
    let previous: Point | undefined = undefined;
    for (const segment of track.segments) {
      for (const point of segment.points) {
        const ptime = point.time;
        if (ptime === undefined) continue;
        if (ptime === time) return point;
        const diff = Math.abs(ptime - time);
        if (ptime > time) {
          if (diff > 15 * 60 * 1000) return previous;
          if (previous === undefined) return point;
          if (Math.abs(previous.time! - time) < diff) return previous;
          return point;
        }
        previous = point;
      }
    }
    return undefined;
  }

  // Duration utilities

  public static durationBetween(startPoint: Point, endPoint: Point): number {
    const startTime = startPoint.time;
    if (startTime === undefined) return 0;
    const endTime = endPoint.time;
    if (endTime === undefined) return 0;
    return endTime - startTime;
  }

}
