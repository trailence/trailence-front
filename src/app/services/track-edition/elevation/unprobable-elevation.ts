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
      const previousEle = points[previous].ele!;
      const previousEleAccuracy = points[previous].eleAccuracy;
      const distance = TrackUtils.distanceBetween(points, previous, i);
      if (previousEleAccuracy !== undefined && eleAccuracy !== undefined && distance < 50) {
        if (eleAccuracy <= previousEleAccuracy / 2 && previousEleAccuracy > 10) {
          // this point has 2 times more precision than the previous, most probably the previous point has a wrong elevation
          points[previous].ele = ele;
          points[previous].eleAccuracy = eleAccuracy + 1;
          i = previous - 1;
          if (i < 0) i = 0;
          continue;
        }
        if (previousEleAccuracy <= eleAccuracy / 2 && eleAccuracy > 10) {
          // previous point has 2 times more precision than the previous, most probably the current point has a wrong elevation
          points[i].ele = previousEle;
          points[i].eleAccuracy = previousEleAccuracy + 1;
          continue;
        }
      }
      const diffEle = Math.abs(ele - previousEle);
      if (diffEle >= distance) {
        // elevation is greater than distance ? most probably we have a problem here

        // if it's a peak, remove the peak
        let previousIndex = TrackUtils.previousPointIndexWithElevation(points, previous);
        if (previousIndex !== -1) {
          const ppEle = points[previousIndex].ele!;
          if (((previousEle < ppEle && previousEle < ele) || (previousEle > ppEle && previousEle > ele)) &&
              (Math.abs(previousEle - ppEle) >= TrackUtils.distanceBetween(points, previousIndex, previous) / 2)) {
            // previous is a peak, set it with the average
            const dist = TrackUtils.distanceBetween(points, previousIndex, i);
            const dist2 = TrackUtils.distanceBetween(points, previousIndex, previous);
            points[previous].ele = ppEle + (dist2 * (ele - ppEle) / dist);
            points[previous].eleAccuracy = undefined;
            continue;
          }
        }
        let nextIndex = TrackUtils.nextPointIndexWithElevation(points, i);
        if (nextIndex !== -1) {
          const nEle = points[nextIndex].ele!;
          if (((ele < previousEle && ele < nEle) || (ele > previousEle && ele > nEle)) &&
              (Math.abs(nEle - ele) >= TrackUtils.distanceBetween(points, i, nextIndex) / 2)) {
            // current point is a peak, set it with the average
            const dist = TrackUtils.distanceBetween(points, previous, nextIndex);
            const dist2 = TrackUtils.distanceBetween(points, previous, i);
            points[i].ele = previous + (dist2 * (nEle - ele) / dist);
            points[i].eleAccuracy = undefined;
            continue;
          }
        }

        // not a peak
        // let's have a look at the 10 previous points
        let nbPrevious = 0;
        let previousTotalEle = 0;
        let previousTotalDist = previousIndex !== -1 ? TrackUtils.distanceBetween(points, previousIndex, previous) : 0;
        while (previousIndex !== -1 && previousTotalDist < 50) {
          nbPrevious++;
          previousTotalEle += points[previousIndex].ele!;
          const j = TrackUtils.previousPointIndexWithElevation(points, previousIndex);
          if (j !== -1)
            previousTotalDist += TrackUtils.distanceBetween(points, j, previousIndex);
          previousIndex = j;
        }

        // let's also have a look at the 10 next points
        let nbNext = 0;
        let nextTotalEle = 0;
        let nextTotalDist = nextIndex !== -1 ? TrackUtils.distanceBetween(points, i, nextIndex) : 0;
        while (nextIndex !== -1 && nextTotalDist < 50) {
          nbNext++;
          nextTotalEle += points[nextIndex].ele!;
          const j = TrackUtils.nextPointIndexWithElevation(points, nextIndex);
          if (j !== -1)
            nextTotalDist += TrackUtils.distanceBetween(points, nextIndex, j);
          nextIndex = j;
        }

        const average = nbNext === 0 ? previousTotalEle / nbPrevious : (nbPrevious === 0 ? nextTotalEle / nbNext : (previousTotalEle + nextTotalEle) / (nbPrevious + nbNext));
        //console.log(i, ele, points[i].pos.lat, points[i].pos.lng, diffEle, distance, nbPrevious, previousTotalEle, previousTotalDist, nbNext, nextTotalEle, nextTotalDist, average);
        if (Math.abs(previousEle - average) < Math.abs(ele - average) && Math.abs(previousEle - average) < diffEle / 2 && Math.abs(ele - average) > diffEle / 2) {
          // looks like the previous point is better
          if (nbPrevious === 0 || nbNext === 0 || Math.abs(previousEle - (nextTotalEle / nbNext)) < Math.abs(ele - (nextTotalEle / nbNext))) {
            // the previous point is closer than the current point from the next average => looks like the current point is really a bad one
            points[i].ele = previousEle;
            points[i].eleAccuracy = previousEleAccuracy !== undefined ? previousEleAccuracy + 1 : undefined;
          } else {
            // let's make an adjustement of the current point
            points[i].ele = previousEle + (ele - previousEle) / 2;
            points[i].eleAccuracy = previousEleAccuracy !== undefined && eleAccuracy !== undefined ? (previousEleAccuracy + eleAccuracy) / 2 + 2 : undefined;
          }
        } else if (Math.abs(previousEle - average) > Math.abs(ele - average) && Math.abs(ele - average) < diffEle / 2 && Math.abs(previousEle - average) > diffEle / 2) {
          // look like the current point is better
          if (nbPrevious === 0 || nbNext === 0 || Math.abs(ele - (previousTotalEle / nbPrevious)) < Math.abs(previousEle - (previousTotalEle / nbPrevious))) {
            // the current point is closer than the previous point from the previous average => looks like the previous point is really a bad one
            points[previous].ele = ele;
            points[previous].eleAccuracy = eleAccuracy !== undefined ? eleAccuracy + 1 : undefined;
          } else {
            // let's make an adjustement of the previous point
            points[previous].ele = ele + (previousEle - ele) / 2;
            points[previous].eleAccuracy = eleAccuracy !== undefined ? eleAccuracy + 1 : undefined;
            points[previous].eleAccuracy = previousEleAccuracy !== undefined && eleAccuracy !== undefined ? (previousEleAccuracy + eleAccuracy) / 2 + 2 : undefined;
          }
          continue;
        }
      }
      /*
      if (eleAccuracy !== undefined && eleAccuracy < 25 && previousEleAccuracy !== undefined && previousEleAccuracy < 25) continue;
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
        if (mostProbable <= 0) {
          points[i].ele = previousEle;
          points[i].eleAccuracy = previousEleAccuracy;
        } else {
          points[previous].ele = ele;
          points[previous].eleAccuracy = eleAccuracy;
          i = previous - 1;
          if (i < 0) i = 0;
        }
      }*/
    }
  }
  return Math.max(nb, 0);
}

/*
function bestAccuracy(a1: number | undefined, a2: number | undefined): number {
  if (a1 === undefined) {
    if (a2 === undefined) {
      return 0;
    }
    return 1;
  }
  if (a2 === undefined) return -1;
  return a1 < a2 ? -1 : (a1 > a2 ? 1 : 0);
}*/
