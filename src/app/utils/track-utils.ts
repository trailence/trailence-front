import { Point } from '../model/point';

export class TrackUtils {

  public static elevationGrade(points: Point[], pointIndex: number): number | undefined {
    const pt = points[pointIndex];
    const pte = pt.ele;
    if (pte === undefined) return undefined;
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
    if (previousEle === undefined) {
      if (nextEle === undefined) return undefined;
      return (nextEle - pte) / nextEleDistance!;
    }
    if (nextEle === undefined) {
      return (pte - previousEle) / previousEleDistance!;
    }
    if ((nextEle < pte && previousEle < pte) || (nextEle > pte && previousEle > pte)) {
      return (pte - previousEle) / previousEleDistance!;
    }
    return (nextEle - previousEle) / (nextEleDistance! + previousEleDistance!);
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

}
