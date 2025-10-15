import { Point } from 'src/app/model/point';
import { PointDescriptor } from 'src/app/model/point-descriptor';
import { applyElevationThresholdToPoints } from './elevation-threshold';

export function improveElevationWithProvider(points: Point[], provided: PointDescriptor[]) {
  applyElevationThresholdToPoints(provided, 10, 250, undefined, provided.length - 1, true);
  const averageDiff = adjustWithAverageDiff(points, provided);
  if (averageDiff === undefined) return;
  for (let i = 0; i < points.length; ++i) {
    const pt = points[i];
    if (pt.ele === undefined) continue;
    const pv = provided[i];
    if (pv.ele === undefined) continue;
    const diff = pv.ele - pt.ele;
    if (Math.abs(diff - averageDiff) > 5) {
      pt.ele += (diff - averageDiff) / 2;
    }
  }
}

function adjustWithAverageDiff(points: Point[], provided: PointDescriptor[]): number | undefined { // NOSONAR
  let diff = 0;
  let nb = 0;
  for (let i = 0; i < points.length; ++i) {
    if (provided[i].ele !== undefined && points[i].ele !== undefined) {
      diff += provided[i].ele! - points[i].ele!;
      nb++;
    }
  }
  if (nb < 2) return undefined;
  diff /= nb;
  if (Math.abs(diff) > 5) {
    const apply = diff > 0 ? diff - 5 : diff + 5;
    for (let i = 0; i < points.length; ++i) {
      if (points[i].ele === undefined) {
        if (provided[i].ele !== undefined) points[i].ele = provided[i].ele! + apply;
      } else {
        points[i].ele! += apply;
      }
    }
  }
  return diff;
}
