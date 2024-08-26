import { Point } from '../model/point';
import * as L from 'leaflet';

export class TrackUtils {

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

  public static distanceBetween(points: Point[], startIndex: number, endIndex: number): number {
    let total = 0;
    for (let i = startIndex + 1; i <= endIndex; ++i) {
      total += points[i].distanceTo(points[i - 1].pos);
    }
    return total;
  }

  public static durationBetween(startPoint: Point, endPoint: Point): number {
    const startTime = startPoint.time;
    if (startTime === undefined) return 0;
    const endTime = endPoint.time;
    if (endTime === undefined) return 0;
    return endTime - startTime;
  }

  public static findClosestPoint(pos: L.LatLngLiteral, points: L.LatLngLiteral[], maxDistance: number = -1): number {
    if (points.length === 0) return -1;
    let closestIndex = -1;
    let closestDistance = -1;
    const p = L.latLng(pos);
    for (let i = 0; i < points.length; ++i) {
      const d = p.distanceTo(points[i]);
      if ((maxDistance < 0 || d <= maxDistance) && (closestDistance === -1 || d < closestDistance)) {
        closestIndex = i;
        closestDistance = d;
      }
    }
    return closestIndex;
  }

}
