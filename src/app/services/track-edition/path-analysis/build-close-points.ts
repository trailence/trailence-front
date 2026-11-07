import { Track } from '@trailence/model/track';
import { distance, EarthPoint } from '@trailence/utils/latlng';

export function getDistancesForAnalysis(track: Track) {
  const trackDistance = track.metadata.distance;
  return trackDistance < 25000 ? ({closePoints: 10, maxDistance: 25, maxDiff: 0.001}) :
    trackDistance < 100000 ? ({closePoints: 40, maxDistance: 100, maxDiff: 0.004}) :
    trackDistance < 500000 ? ({closePoints: 200, maxDistance: 500, maxDiff: 0.02}) :
    ({closePoints: 500, maxDistance: 1000, maxDiff: 0.04});
}

export function buildClosePointsFromTrack(track: Track, maxDistance: number): {point: EarthPoint, distanceToPrevious: number}[] {
  return buildClosePoints(track.getAllPositions(), maxDistance);
}

export function buildClosePoints(points: EarthPoint[], maxDistance: number): {point: EarthPoint, distanceToPrevious: number}[] {
  if (points.length === 0) return [];
  const result: {point: EarthPoint, distanceToPrevious: number}[] = [];
  result.push({point: points[0], distanceToPrevious: 0});
  let previous = points[0];
  for (let i = 1; i < points.length; ++i) {
    const p = points[i];
    let distanceToPrevious: number;
    while ((distanceToPrevious = distance(p, previous)) > maxDistance) {
      let np = {lat: previous.lat + (p.lat - previous.lat) / 2, lng: previous.lng + (p.lng - previous.lng) / 2};
      let distanceToPrevious2: number;
      while ((distanceToPrevious2 = distance(np, previous)) > maxDistance) {
        np = {lat: previous.lat + (np.lat - previous.lat) / 2, lng: previous.lng + (np.lng - previous.lng) / 2};
      }
      result.push({point: np, distanceToPrevious: distanceToPrevious2});
      previous = np;
    }
    result.push({point: p, distanceToPrevious});
    previous = p;
  }
  return result;
}
