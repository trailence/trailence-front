import { Track } from 'src/app/model/track';
import { TrailLoopType } from 'src/app/model/trail';
import { buildClosePoints } from './build-close-points';

export function detectLoopType(track: Track): TrailLoopType | undefined { // NOSONAR
  const arrival = track.arrivalPoint;
  if (!arrival) return undefined;
  const departure = track.departurePoint;
  if (!departure) return undefined;
  const departureArrivalDistance = departure.distanceTo(arrival.pos);
  if (departureArrivalDistance > 250) return TrailLoopType.ONE_WAY;
  let points = track.getAllPositions();
  if (departureArrivalDistance > 5) points.push(points[0]);
  const trackDistance = track.metadata.distance;
  const useDistances =
    trackDistance < 25000 ? ({closePoints: 10, maxDistance: 25, maxDiff: 0.00025}) :
    trackDistance < 100000 ? ({closePoints: 40, maxDistance: 100, maxDiff: 0.001}) :
    trackDistance < 500000 ? ({closePoints: 200, maxDistance: 500, maxDiff: 0.005}) :
    ({closePoints: 500, maxDistance: 1000, maxDiff: 0.01});
  const pointsWithDistance = buildClosePoints(points, useDistances.closePoints);

  let distanceOutAndBack = 0;
  let totalDistance = 0;
  const processed: number[] = [];
  for (let i = 1; i < pointsWithDistance.length; ++i) {
    const p1 = pointsWithDistance[i - 1];
    const p2 = pointsWithDistance[i];
    const distance = p2.distanceToPrevious;
    totalDistance += distance;
    if (processed.indexOf(i) >= 0) continue;
    const angle = Math.atan2(p2.point.lat - p1.point.lat, p2.point.lng - p1.point.lng);

    let best = -1;
    let bestDistance = -1;
    let bestDistanceWithPoints = -1;
    for (let j = pointsWithDistance.length - 2; j > i; --j) {
      if (processed.indexOf(j) >= 0) continue;
      const p3 = pointsWithDistance[j];
      if (Math.abs(p3.point.lat - p2.point.lat + p3.point.lng - p2.point.lng) > useDistances.maxDiff) continue;
      const p4 = pointsWithDistance[j + 1];
      if (Math.abs(p4.point.lat - p1.point.lat + p4.point.lng - p1.point.lng) > useDistances.maxDiff) continue;
      const d1 = p3.point.distanceTo(p2.point);
      if (d1 > useDistances.maxDistance) continue;
      const d2 = p4.point.distanceTo(p1.point);
      if (d2 > useDistances.maxDistance) continue;
      if (bestDistanceWithPoints !== -1 && d1 + d2 >= bestDistanceWithPoints) continue;
      const angle2 = Math.atan2(p3.point.lat - p4.point.lat, p3.point.lng - p4.point.lng);
      if (Math.abs(angle - angle2) > 1) continue;
      bestDistanceWithPoints = d1 + d2;
      bestDistance = p4.distanceToPrevious;
      best = j;
      if (bestDistanceWithPoints < useDistances.closePoints) break;
    }
    if (best !== -1) {
      distanceOutAndBack += distance + bestDistance;
      processed.push(best);
    }
  }
  const outAndBack = distanceOutAndBack / totalDistance;
  if (outAndBack > 0.85) return TrailLoopType.OUT_AND_BACK;
  if (outAndBack < 0.25) return TrailLoopType.LOOP;
  if (outAndBack < 0.6) return TrailLoopType.HALF_LOOP;
  return TrailLoopType.SMALL_LOOP;
}
