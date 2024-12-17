import { Track } from 'src/app/model/track';
import { buildClosePointsFromTrack, getDistancesForAnalysis } from './build-close-points';
import L from 'leaflet';

export function estimateSimilarity(track1: Track, track2: Track): number {
  const bounds1 = track1.metadata.bounds;
  if (!bounds1) return 0;
  const bounds2 = track2.metadata.bounds;
  if (!bounds2) return 0;
  if (!bounds1.overlaps(bounds2)) return 0;

  const distances1 = getDistancesForAnalysis(track1);
  const distances2 = getDistancesForAnalysis(track2);
  const useDistances = {
    closePoints: Math.max(distances1.closePoints, distances2.closePoints),
    maxDistance: Math.max(distances1.maxDistance, distances2.maxDistance),
    maxDiff: Math.max(distances1.maxDiff, distances2.maxDiff),
  };

  const points1 = buildClosePointsFromTrack(track1, useDistances.closePoints);
  const points2 = buildClosePointsFromTrack(track2, useDistances.closePoints);

  const nbPoints1 = points1.length;
  let nbFound1 = 0.0;
  for (let i = 0; i < points1.length; ++i) {
    const closest = findClosestPoint(points2, points1[i].point, useDistances.maxDistance, useDistances.maxDiff);
    if (closest) {
      if (closest.distance <= 1) nbFound1 += 1;
      else nbFound1 += 0.95 + (useDistances.maxDistance - closest.distance) / (useDistances.maxDistance - 1) * 0.05;
    }
  }
  if (nbFound1 == nbPoints1) return 1;

  const nbPoints2 = points2.length;
  let nbFound2 = 0.0;
  for (let i = 0; i < points2.length; ++i) {
    const closest = findClosestPoint(points1, points2[i].point, useDistances.maxDistance, useDistances.maxDiff);
    if (closest) {
      if (closest.distance <= 1) nbFound2 += 1;
      else nbFound2 += 0.95 + (useDistances.maxDistance - closest.distance) / (useDistances.maxDistance - 1) * 0.05;
    }
  }
  return Math.min(nbFound1 / nbPoints1, nbFound2 / nbPoints2);
}

function findClosestPoint(points: {point: L.LatLng, distanceToPrevious: number}[], pos: L.LatLng, maxDistance: number, maxDiff: number): {pos: L.LatLng, distance: number} | undefined {
  let bestPoint: L.LatLng | undefined;
  let bestDistance: number | undefined;
  for (const p of points) {
    const l = p.point;
    if (Math.abs(l.lat - pos.lat + l.lng - pos.lng) > maxDiff) continue;
    const d = l.distanceTo(pos);
    if (d > maxDistance) continue;
    if (bestDistance === undefined || d < bestDistance) {
      bestPoint = l;
      bestDistance = d;
      if (d === 0) break;
    }
  }
  return bestPoint ? {pos: bestPoint, distance: bestDistance!} : undefined;
}
