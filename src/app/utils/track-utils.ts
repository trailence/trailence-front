import { Point, PointDescriptor, samePositionRound } from '../model/point';
import * as L from 'leaflet';
import { ComputedWayPoint, Track } from '../model/track';
import { Segment } from '../model/segment';
import { PreferencesService } from '../services/preferences/preferences.service';
import { WayPoint } from '../model/way-point';

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

  public static distanceBetween(points: PointDescriptor[], startIndex: number, endIndex: number): number {
    let total = 0;
    for (let i = startIndex + 1; i <= endIndex; ++i) {
      total += TrackUtils.getDistanceFromPreviousPoint(points, i);
    }
    return total;
  }

  public static getDistanceFromPreviousPoint(points: PointDescriptor[], index: number): number {
    const p = points[index];
    if ((p as any)['distanceFromPreviousPoint'] !== undefined) return (p as Point).distanceFromPreviousPoint;
    const pos = p.pos instanceof L.LatLng ? p.pos : L.latLng(p.pos.lat, p.pos.lng);
    return pos.distanceTo(points[index - 1].pos);
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

  public static findClosestPointInTrack(pos: L.LatLngLiteral, track: Track, maxDistance: number = -1): {segmentIndex: number, pointIndex: number} | undefined {
    let closestSegmentIndex = -1;
    let closestPointIndex = -1;
    let closestDistance = -1;
    const p = L.latLng(pos);
    const segments = track.segments;
    for (let si = 0; si < segments.length; ++si) {
      const points = segments[si].points;
      for (let pi = 0; pi < points.length; ++pi) {
        const p2 = points[pi].pos;
        if (p.lat === p2.lat && p.lng === p2.lng) return {segmentIndex: si, pointIndex: pi};
        const d = p.distanceTo(p2);
        if (d <= 0.1) return {segmentIndex: si, pointIndex: pi};
        if ((maxDistance < 0 || d <= maxDistance) && (closestDistance === -1 || d < closestDistance)) {
          closestSegmentIndex = si;
          closestPointIndex = pi;
          closestDistance = d;
        }
      }
    }
    return closestSegmentIndex >= 0 ? {segmentIndex: closestSegmentIndex, pointIndex: closestPointIndex} : undefined;
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

  // Way points

  public static findWayPoints(track: Track, startSegmentIndex: number, startPointIndex: number, endSegmentIndex: number, endPointIndex: number, prefs: PreferencesService) {
    let computed = ComputedWayPoint.compute(track, prefs.preferences);
    computed = computed.filter(wp =>
      wp.nearestSegmentIndex !== undefined && wp.nearestPointIndex !== undefined &&
      this.inRange(wp.nearestSegmentIndex, wp.nearestPointIndex, startSegmentIndex, startPointIndex, endSegmentIndex, endPointIndex)
    );
    return track.wayPoints.filter(wp => computed.find(c => c.wayPoint.isEquals(wp)));
  }

  public static getWayPointAt(track: Track, position: L.LatLngLiteral): WayPoint | undefined {
    for (const wp of track.wayPoints) {
      if (wp.point.pos.lat === position.lat && wp.point.pos.lng === position.lng)
        return wp;
    }
    for (const wp of track.wayPoints) {
      if (samePositionRound(wp.point.pos, position))
        return wp;
    }
    return undefined;
  }

  public static inRange(segmentIndex: number, pointIndex: number, startSegmentIndex: number, startPointIndex: number, endSegmentIndex: number, endPointIndex: number): boolean {
    if (segmentIndex < startSegmentIndex || segmentIndex > endSegmentIndex) return false;
    if (segmentIndex === startSegmentIndex && pointIndex < startPointIndex) return false;
    if (segmentIndex === endSegmentIndex && pointIndex > endPointIndex) return false;
    return true;
  }


}
