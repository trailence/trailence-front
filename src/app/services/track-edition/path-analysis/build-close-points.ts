import { Track } from 'src/app/model/track';
import * as L from 'leaflet';

export function buildClosePointsFromTrack(track: Track, maxDistance: number): L.LatLng[] {
  return buildClosePoints(track.getAllPositions(), maxDistance);
}

export function buildClosePoints(points: L.LatLng[], maxDistance: number): L.LatLng[] {
  const result: L.LatLng[] = [];
  if (points.length === 0) return result;
  result.push(points[0]);
  let previous = points[0];
  for (let i = 1; i < points.length; ++i) {
    const p = points[i];
    while (p.distanceTo(previous) > maxDistance) {
      let np = L.latLng(previous.lat + (p.lat - previous.lat) / 2, previous.lng + (p.lng - previous.lng) / 2);
      while (np.distanceTo(previous) > maxDistance) {
        np = L.latLng(previous.lat + (np.lat - previous.lat) / 2, previous.lng + (np.lng - previous.lng) / 2);
      }
      result.push(np);
      previous = np;
    }
    result.push(p);
    previous = p;
  }
  return result;
}
