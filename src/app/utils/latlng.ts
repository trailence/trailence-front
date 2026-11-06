import { Point2D } from './geometry-utils';

export const EARTH_RADIUS = 6371000; // meters
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export type EarthPoint = {lat: number, lng: number, ele?: number};
export type EarthBBox = {minlat: number, maxlat: number, minlng: number, maxlng: number};

export function samePosition(p1: EarthPoint, p2: EarthPoint): boolean {
  return p1.lat === p2.lat && p1.lng === p2.lng;
}

export function sameOptionalPosition(p1: EarthPoint | undefined, p2: EarthPoint | undefined): boolean {
  if (p1 === undefined) return p2 === undefined;
  if (p2 === undefined) return false;
  return p1.lat === p2.lat && p1.lng === p2.lng;
}

export function normalizePoint(point: EarthPoint): EarthPoint {
  const n = {lat: normalizeLatitude(point.lat), lng: normalizeLongitude(point.lng)};
  if (n.lat !== point.lat || n.lng !== point.lng) return n;
  return point;
}

export function normalizeLatitude(latitude: number): number {
  while (latitude < -90) latitude += 180;
  while (latitude > 90) latitude -= 180;
  return latitude;
}

export function normalizeLongitude(longitude: number): number {
  while (longitude < -180) longitude += 360;
  while (longitude > 180) longitude -= 360;
  return longitude;
}


export function distance(latlng1: EarthPoint, latlng2: EarthPoint) {
  const lat1 = latlng1.lat * DEG_TO_RAD;
  const lat2 = latlng2.lat * DEG_TO_RAD;
  const sinDLat = Math.sin((latlng2.lat - latlng1.lat) * DEG_TO_RAD / 2);
  const sinDLon = Math.sin((latlng2.lng - latlng1.lng) * DEG_TO_RAD / 2);
  const a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

const EPSG3857_MAX_LATITUDE = 85.0511287798;
const EPSG3857_EARTH_RADIUS = 6378137;
const EPSG3857_TRANSFORM_SCALE = 0.5 / (Math.PI * EPSG3857_EARTH_RADIUS);

/** Projection using EPSG3857 */
export function projectEarthPoint(p: EarthPoint): Point2D {
  const lat = Math.max(Math.min(EPSG3857_MAX_LATITUDE, p.lat), -EPSG3857_MAX_LATITUDE);
  const sin = Math.sin(lat * DEG_TO_RAD);
  return {x: EPSG3857_EARTH_RADIUS * p.lng * DEG_TO_RAD, y: EPSG3857_EARTH_RADIUS * Math.log((1 + sin) / (1 - sin)) / 2};
}

/** Projection using EPSG3857 */
export function unprojectToEarthPoint(p: Point2D): EarthPoint {
  return {
    lat: (2 * Math.atan(Math.exp(p.y / EPSG3857_EARTH_RADIUS)) - (Math.PI / 2)) * RAD_TO_DEG,
    lng: p.x * RAD_TO_DEG / EPSG3857_EARTH_RADIUS,
  };
}

export function projectEarthPointForZoom(p: EarthPoint, zoom: number): Point2D {
  const projection = projectEarthPoint(p);
  const zoomScale = 256 * Math.pow(2, zoom);
  return {
    x: zoomScale * (EPSG3857_TRANSFORM_SCALE * projection.x + 0.5),
    y: zoomScale * (-EPSG3857_TRANSFORM_SCALE * projection.y + 0.5),
  };
}

export function unprojectToEarthPointForZoom(p: Point2D, zoom: number): EarthPoint {
  const zoomScale = 256 * Math.pow(2, zoom);
  const untransformedPoint = {
    x: (p.x / zoomScale - 0.5) / EPSG3857_TRANSFORM_SCALE,
    y: (p.y / zoomScale - 0.5) / -EPSG3857_TRANSFORM_SCALE,
  };
  return unprojectToEarthPoint(untransformedPoint);
}

export function earthBBox(p1: EarthPoint, p2: EarthPoint): EarthBBox {
  return {
    minlat: Math.min(p1.lat, p2.lat),
    maxlat: Math.max(p1.lat, p2.lat),
    minlng: Math.min(p1.lng, p2.lng),
    maxlng: Math.max(p1.lng, p2.lng),
  }
}

export function sameBbox(b1: EarthBBox, b2: EarthBBox): boolean {
  return b1.minlat === b2.minlat &&
    b1.maxlat === b2.maxlat &&
    b1.minlng === b2.minlng &&
    b1.maxlng === b2.maxlng;
}

export function sameOptionalBbox(b1: EarthBBox | undefined, b2: EarthBBox | undefined): boolean {
  if (b1 === undefined) return b2 === undefined;
  if (b2 === undefined) return false;
  return b1.minlat === b2.minlat &&
    b1.maxlat === b2.maxlat &&
    b1.minlng === b2.minlng &&
    b1.maxlng === b2.maxlng;
}

export function extendBBox(b1: EarthBBox, b2: EarthBBox): EarthBBox {
  return {
    minlat: Math.min(b1.minlat, b2.minlat),
    maxlat: Math.max(b1.maxlat, b2.maxlat),
    minlng: Math.min(b1.minlng, b2.minlng),
    maxlng: Math.max(b1.maxlng, b2.maxlng),
  };
}

export function extendBBoxWithPoint(b: EarthBBox, p: EarthPoint): EarthBBox {
  return {
    minlat: Math.min(b.minlat, p.lat),
    maxlat: Math.max(b.maxlat, p.lat),
    minlng: Math.min(b.minlng, p.lng),
    maxlng: Math.max(b.maxlng, p.lng),
  };
}

export function isPointInBBox(point: EarthPoint, bbox: EarthBBox, tolerance?: EarthPoint): boolean {
  return point.lat >= bbox.minlat - (tolerance?.lat ?? 0) &&
    point.lat <= bbox.maxlat + (tolerance?.lat ?? 0) &&
    point.lng >= bbox.minlng - (tolerance?.lng ?? 0) &&
    point.lng <= bbox.maxlng + (tolerance?.lng ?? 0);
}

export function bboxCenter(bbox: EarthBBox): EarthPoint {
  return {lat: bbox.minlat + (bbox.maxlat - bbox.minlat) / 2, lng: bbox.minlng + (bbox.maxlng - bbox.minlng) / 2};
}

export function bboxPadRatio(bbox: EarthBBox, padRatio: number): EarthBBox {
  const latPadding = (bbox.maxlat - bbox.minlat) * padRatio;
  const lngPadding = (bbox.maxlng - bbox.minlng) * padRatio;
  return {
    minlat: bbox.minlat - latPadding,
    maxlat: bbox.maxlat + latPadding,
    minlng: bbox.minlng - lngPadding,
    maxlng: bbox.maxlng + latPadding,
  }
}

export function bboxFromList(bboxes: EarthBBox[]): EarthBBox | undefined {
  if (bboxes.length === 0) return undefined;
  let result = bboxes[0];
  for (let i = 1; i < bboxes.length; ++i) result = extendBBox(result, bboxes[i]);
  return result;
}

/**
 * Converts a geographic point (lat, lng) into local (x, y) coordinates relative to an origin.
 * The result is x: East/west distance from the origin, in meters; y: North/south distance from the origin, in meters.
 */
export function toLocalMeters(
  p: EarthPoint,
  origin: EarthPoint
): Point2D {
  const latRad = (origin.lat * Math.PI) / 180;

  const x =
    ((p.lng - origin.lng) * Math.PI / 180) *
    EARTH_RADIUS *
    Math.cos(latRad);

  const y =
    ((p.lat - origin.lat) * Math.PI / 180) *
    EARTH_RADIUS;

  return { x, y };
}

export function fromLocalMeters(
  x: number,
  y: number,
  origin: EarthPoint
): EarthPoint {
  const latRad = (origin.lat * Math.PI) / 180;

  return {
    lat:
      origin.lat +
      (y / EARTH_RADIUS) * (180 / Math.PI),

    lng:
      origin.lng +
      (x / (EARTH_RADIUS * Math.cos(latRad))) *
        (180 / Math.PI),
  };
}

export type ClosestMatch =
  | {
      point: EarthPoint;
      distanceMeters: number;

      // closest point is exactly one path point
      type: "vertex";
      index: number;
    }
  | {
      point: EarthPoint;
      distanceMeters: number;

      // closest point lies somewhere along a segment
      type: "segment";
      indexBefore: number;
      indexAfter: number;
      t: number; // interpolation factor [0..1]
    };

const EPS = 1e-9;

export function findClosestPointOnPath(
  path: EarthPoint[],
  searchPoint: EarthPoint,
  thresholdMeters: number,
): ClosestMatch | undefined {
  if (path.length < 2) {
    return undefined;
  }

  let best:
    | (ClosestMatch & { distanceMeters: number })
    | undefined;

  for (let i = 0; i < path.length - 1; i++) {
    const result = closestPointOnSegment(
      searchPoint,
      path[i],
      path[i + 1]
    );
    if (!result) continue;

    const { point, distanceMeters, t } = result;

    if (
      !best ||
      distanceMeters < best.distanceMeters
    ) {
      if (t <= EPS) {
        best = {
          type: "vertex",
          index: i,
          point,
          distanceMeters,
        };
      } else if (t >= 1 - EPS) {
        best = {
          type: "vertex",
          index: i + 1,
          point,
          distanceMeters,
        };
      } else {
        best = {
          type: "segment",
          indexBefore: i,
          indexAfter: i + 1,
          t,
          point,
          distanceMeters,
        };
      }
    }
  }

  if (!best || best.distanceMeters > thresholdMeters) {
    return undefined;
  }

  return best;
}

export interface ClosestPointOnSegment {
  point: EarthPoint;
  distanceMeters: number;
  t: number;
}

export function closestPointOnSegment(
  searchPoint: EarthPoint,
  a: EarthPoint,
  b: EarthPoint
): ClosestPointOnSegment | undefined {
  // Use p as local projection origin
  const P = { x: 0, y: 0 };

  const A = toLocalMeters(a, searchPoint);
  const B = toLocalMeters(b, searchPoint);

  const ABx = B.x - A.x;
  const ABy = B.y - A.y;

  const ab2 = ABx * ABx + ABy * ABy;

  // Segment is degenerate (a and b are same point)
  if (ab2 === 0) {
    return undefined;
  }

  let t =
    ((P.x - A.x) * ABx + (P.y - A.y) * ABy) /
    ab2;

  // Clamp to segment
  t = Math.max(0, Math.min(1, t));

  const closestX = A.x + t * ABx;
  const closestY = A.y + t * ABy;

  const distanceMeters = Math.hypot(
    closestX,
    closestY
  );

  return {
    point: fromLocalMeters(
      closestX,
      closestY,
      searchPoint
    ),
    distanceMeters,
    t,
  };
}

export function bearing(from: EarthPoint, to: EarthPoint): number {
  const meanLat = ((from.lat + to.lat) / 2) * Math.PI / 180;

  const dx = (to.lng - from.lng) * Math.cos(meanLat);
  const dy = to.lat - from.lat;

  let θ = Math.atan2(dy, dx) * 180 / Math.PI - 90;
  // Normalize to [0, 360)
  θ = (θ + 360) % 360;
  return θ;
  /*
  const φ1 = from.lat * Math.PI / 180;
  const φ2 = to.lat * Math.PI / 180;
  const λ1 = from.lng * Math.PI / 180;
  const λ2 = to.lng * Math.PI / 180;

  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);

  let θ = Math.atan2(y, x) * 180 / Math.PI;

  // Normalize to [0, 360)
  θ = (θ + 360) % 360;

  return θ;*/
}
