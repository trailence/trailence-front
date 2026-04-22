import * as L from 'leaflet';

export function calculateTilesFromBounds(zoomLevel: number, bounds: L.LatLngBounds[], crs: L.CRS, tileSize: number): Promise<L.Point[]> {
  const points: L.Point[] = [];
  const coordsSet = new Set<number>();
  const xSize = Math.floor(Math.pow(2, 9 + zoomLevel) / tileSize);
  const nextBound = (boundIndex: number) => new Promise<L.Point[]>(resolve => {
    if (boundIndex >= bounds.length) {
      resolve(points);
      return;
    }
    const bound = bounds[boundIndex];
    const area = L.bounds(
      crs.latLngToPoint(bound.getNorthWest(), zoomLevel),
      crs.latLngToPoint(bound.getSouthEast(), zoomLevel)
    );
    addTilesPoints(coordsSet, points, area, tileSize, xSize);
    setTimeout(() => nextBound(boundIndex + 1).then(resolve), 0);
  });
  return nextBound(0);
}

export function addTilesPoints(coordsSet: Set<number>, points: L.Point[], area: L.Bounds, tileSize: number, xSize: number): void {
  if (area.min && area.max) {
    const topLeftTile = area.min.divideBy(tileSize).floor();
    const bottomRightTile = area.max.divideBy(tileSize).floor();

    for (let y = topLeftTile.y; y <= bottomRightTile.y; ++y) {
      for (let x = topLeftTile.x; x <= bottomRightTile.x; ++x) {
        const coords = y * xSize + x;
        if (!coordsSet.has(coords)) {
          coordsSet.add(coords);
          points.push(new L.Point(x, y));
        }
      }
    }
  }
}

export function calculateTilesFromPaths(zoomLevel: number, paths: L.LatLngExpression[], pathAroundMeters: number, crs: L.CRS, tileSize: number): Promise<L.Point[]> {
  const points: L.Point[] = [];
  const samplePoint = crs.latLngToPoint(paths[0], zoomLevel);
  const pixelLatDistance = crs.pointToLatLng(L.point(samplePoint.x, samplePoint.y + 1), zoomLevel).distanceTo(paths[0]);
  const pixelLngDistance = crs.pointToLatLng(L.point(samplePoint.x + 1, samplePoint.y), zoomLevel).distanceTo(paths[0]);
  const latPixels = Math.round(pathAroundMeters / pixelLatDistance) + 1;
  const lngPixels = Math.round(pathAroundMeters / pixelLngDistance) + 1;
  const coordsSet = new Set<number>();
  const xSize = Math.floor(Math.pow(2, 9 + zoomLevel) / tileSize);

  const computeNextPoints = (index: number) => new Promise<L.Point[]>(resolve => {
    const nbPoints = Math.min(1000, paths.length - index);
    for (let i = index; i < index + nbPoints; ++i) {
      const pos = paths[i];
      const point = crs.latLngToPoint(pos, zoomLevel);
      const northWest = L.point(point.x - lngPixels, point.y - latPixels);
      const southEast = L.point(point.x + lngPixels, point.y + latPixels);
      const area = L.bounds(northWest, southEast);
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
