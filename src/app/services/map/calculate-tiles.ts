import { bbox2D, BBox2D, Point2D } from '@trailence/utils/geometry-utils';
import { distance, EarthBBox, EarthPoint, projectEarthBBoxForZoom, projectEarthPointForZoom, unprojectToEarthPointForZoom } from '@trailence/utils/latlng';

export function calculateTilesFromBounds(zoomLevel: number, bounds: EarthBBox[], tileSize: number): Promise<Point2D[]> {
  const points: Point2D[] = [];
  const coordsSet = new Set<number>();
  const xSize = Math.floor(Math.pow(2, 9 + zoomLevel) / tileSize);
  const nextBound = (boundIndex: number) => new Promise<Point2D[]>(resolve => {
    if (boundIndex >= bounds.length) {
      resolve(points);
      return;
    }
    const bound = bounds[boundIndex];
    const area = projectEarthBBoxForZoom(bound, zoomLevel);
    addTilesPoints(coordsSet, points, area, tileSize, xSize);
    setTimeout(() => nextBound(boundIndex + 1).then(resolve), 0);
  });
  return nextBound(0);
}

export function addTilesPoints(coordsSet: Set<number>, points: Point2D[], area: BBox2D, tileSize: number, xSize: number): void {
  const top = Math.floor(area.minY / tileSize);
  const bottom = Math.floor(area.maxY / tileSize);
  const left = Math.floor(area.minX / tileSize);
  const right = Math.floor(area.maxX / tileSize);

  for (let y = top; y <= bottom; ++y) {
    for (let x = left; x <= right; ++x) {
      const coords = y * xSize + x;
      if (!coordsSet.has(coords)) {
        coordsSet.add(coords);
        points.push({x, y});
      }
    }
  }
}

export function calculateTilesFromPaths(zoomLevel: number, paths: EarthPoint[], pathAroundMeters: number, tileSize: number): Promise<Point2D[]> {
  const points: Point2D[] = [];
  const samplePoint = projectEarthPointForZoom(paths[0], zoomLevel);
  const pixelLatDistance = distance(paths[0], unprojectToEarthPointForZoom({x: samplePoint.x, y: samplePoint.y + 1}, zoomLevel));
  const pixelLngDistance = distance(paths[0], unprojectToEarthPointForZoom({x: samplePoint.x + 1, y: samplePoint.y}, zoomLevel));
  const latPixels = Math.round(pathAroundMeters / pixelLatDistance) + 1;
  const lngPixels = Math.round(pathAroundMeters / pixelLngDistance) + 1;
  const coordsSet = new Set<number>();
  const xSize = Math.floor(Math.pow(2, 9 + zoomLevel) / tileSize);

  const computeNextPoints = (index: number) => new Promise<Point2D[]>(resolve => {
    const nbPoints = Math.min(1000, paths.length - index);
    for (let i = index; i < index + nbPoints; ++i) {
      const pos = paths[i];
      const point = projectEarthPointForZoom(pos, zoomLevel);
      const northWest = {x: point.x - lngPixels, y: point.y - latPixels};
      const southEast = {x: point.x + lngPixels, y: point.y + latPixels};
      const area = bbox2D(northWest, southEast);
      addTilesPoints(coordsSet, points, area, tileSize, xSize);
    }
    if (index + nbPoints === paths.length) {
      resolve(points);
    } else {
      setTimeout(() => computeNextPoints(index + nbPoints).then(resolve), 0);
    }
  });
  return computeNextPoints(0);
}
