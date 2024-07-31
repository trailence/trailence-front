import { Segment } from 'src/app/model/segment';
import { Track } from 'src/app/model/track';
import { TrackUtils } from 'src/app/utils/track-utils';

export function adjustUnprobableElevationToTrack(track: Track) {
  for (const segment of track.segments)
    adjustUnprobableElevationToSegment(segment, undefined, true);
}

export function adjustUnprobableElevationToSegment(segment: Segment, lastIndex: number | undefined, finish: boolean): number {
  const points = segment.points;
  const nb = finish ? points.length : points.length - 10;
  for (let i = lastIndex ?? 0; i < nb; ++i) {
    const ele = points[i].ele;
    if (ele === undefined) continue;
    const eleAccuracy = points[i].eleAccuracy;
    let previous = TrackUtils.previousPointIndexWithElevation(points, i);
    if (previous !== -1) {
      const previousEleAccuracy = points[previous].eleAccuracy;
      if (eleAccuracy !== undefined && eleAccuracy < 25 && previousEleAccuracy !== undefined && previousEleAccuracy < 25) continue;
      const previousEle = points[previous].ele!;
      const distance = TrackUtils.distanceBetween(points, previous, i);
      const diff = Math.abs(ele - previousEle);
      const diffByMeter = diff / distance;
      if (diffByMeter > 1 && diff > 10) {
        let mostProbable;
        if (previousEleAccuracy !== undefined || eleAccuracy !== undefined)
          mostProbable = bestAccuracy(previousEleAccuracy, eleAccuracy);
        else {
          const next = TrackUtils.nextPointIndexWithElevation(points, i);
          if (next < 0) continue;
          const nextEle = points[next].ele!;
          const nextDistance = TrackUtils.distanceBetween(points, i, next);
          const nextDiffByMeter = Math.abs(nextEle - ele) / nextDistance;
          if (nextDiffByMeter < diffByMeter)
            mostProbable = 1;
          else
            mostProbable = -1;
        }
        console.log(i, diffByMeter, mostProbable, previousEle, ele, previousEleAccuracy, eleAccuracy);
        if (mostProbable <= 0) {
          points[i].ele = previousEle;
          points[i].eleAccuracy = previousEleAccuracy;
        } else {
          points[previous].ele = ele;
          points[previous].eleAccuracy = eleAccuracy;
          i = previous - 1;
          if (i < 0) i = 0;
        }
      }
    }
  }
  return Math.max(nb, 0);
}

function bestAccuracy(a1: number | undefined, a2: number | undefined): number {
  if (a1 === undefined) {
    if (a2 === undefined) {
      return 0;
    }
    return 1;
  }
  if (a2 === undefined) return -1;
  return a1 < a2 ? -1 : (a1 > a2 ? 1 : 0);
}
