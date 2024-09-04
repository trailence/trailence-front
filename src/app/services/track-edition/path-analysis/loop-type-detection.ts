import { Track } from 'src/app/model/track';
import { TrailLoopType } from 'src/app/model/trail';
import { buildClosePoints } from './build-close-points';

export function detectLoopType(track: Track): TrailLoopType | undefined {
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
    trackDistance < 25000 ? ({closePoints: 10, maxDistance: 25}) :
    trackDistance < 100000 ? ({closePoints: 40, maxDistance: 100}) :
    trackDistance < 500000 ? ({closePoints: 200, maxDistance: 500}) :
    ({closePoints: 500, maxDistance: 1000});
  points = buildClosePoints(points, useDistances.closePoints);

  let distanceOutAndBack = 0;
  let totalDistance = 0;
  const processed: number[] = [];
  for (let i = 1; i < points.length; ++i) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const distance = p2.distanceTo(p1);
    totalDistance += distance;
    if (processed.indexOf(i) >= 0) continue;
    const angle = Math.atan2(p2.lat - p1.lat, p2.lng - p1.lng);

    let best = -1;
    let bestDistance = -1;
    let bestDistanceWithPoints = -1;
    for (let j = points.length - 2; j > i; --j) {
      if (processed.indexOf(j) >= 0) continue;
      const p3 = points[j];
      const p4 = points[j + 1];
      const d1 = p3.distanceTo(p2);
      if (d1 > useDistances.maxDistance) continue;
      const d2 = p4.distanceTo(p1);
      if (d2 > useDistances.maxDistance) continue;
      if (bestDistanceWithPoints !== -1 && d1 + d2 >= bestDistanceWithPoints) continue;
      const angle2 = Math.atan2(p3.lat - p4.lat, p3.lng - p4.lng);
      if (Math.abs(angle - angle2) > 1) continue;
      bestDistanceWithPoints = d1 + d2;
      bestDistance = p4.distanceTo(p3);
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
