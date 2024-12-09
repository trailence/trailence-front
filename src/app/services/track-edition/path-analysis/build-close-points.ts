import { Track } from 'src/app/model/track';
import L from 'leaflet';

export function buildClosePointsFromTrack(track: Track, maxDistance: number): {point: L.LatLng, distanceToPrevious: number}[] {
  return buildClosePoints(track.getAllPositions(), maxDistance);
}

export function buildClosePoints(points: L.LatLng[], maxDistance: number): {point: L.LatLng, distanceToPrevious: number}[] {
  if (points.length === 0) return [];
  const result: {point: L.LatLng, distanceToPrevious: number}[] = [];
  result.push({point: points[0], distanceToPrevious: 0});
  let previous = points[0];
  for (let i = 1; i < points.length; ++i) {
    const p = points[i];
    let distanceToPrevious: number;
    while ((distanceToPrevious = p.distanceTo(previous)) > maxDistance) {
      let np = L.latLng(previous.lat + (p.lat - previous.lat) / 2, previous.lng + (p.lng - previous.lng) / 2);
      let distanceToPrevious2: number;
      while ((distanceToPrevious2 = np.distanceTo(previous)) > maxDistance) {
        np = L.latLng(previous.lat + (np.lat - previous.lat) / 2, previous.lng + (np.lng - previous.lng) / 2);
      }
      result.push({point: np, distanceToPrevious: distanceToPrevious2});
      previous = np;
    }
    result.push({point: p, distanceToPrevious});
    previous = p;
  }
  return result;
}
