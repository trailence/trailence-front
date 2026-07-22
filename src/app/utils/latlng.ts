export const EARTH_RADIUS = 6371000; // meters

export type EarthPoint = {lat: number, lng: number};
export type EarthBBox = {minlat: number, maxlat: number, minlng: number, maxlng: number};

export function distance(latlng1: EarthPoint, latlng2: EarthPoint) {
  const rad = Math.PI / 180,
  lat1 = latlng1.lat * rad,
  lat2 = latlng2.lat * rad,
  sinDLat = Math.sin((latlng2.lat - latlng1.lat) * rad / 2),
  sinDLon = Math.sin((latlng2.lng - latlng1.lng) * rad / 2),
  a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon,
  c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

export function toLocalMeters(
  p: EarthPoint,
  origin: EarthPoint
): { x: number; y: number } {
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

export function earthBBox(p1: EarthPoint, p2: EarthPoint): EarthBBox {
  return {
    minlat: Math.min(p1.lat, p2.lat),
    maxlat: Math.max(p1.lat, p2.lat),
    minlng: Math.min(p1.lng, p2.lng),
    maxlng: Math.max(p1.lng, p2.lng),
  }
}

export function isPointInBBox(point: EarthPoint, bbox: EarthBBox, tolerance: EarthPoint): boolean {
  return point.lat >= bbox.minlat - tolerance.lat &&
    point.lat <= bbox.maxlat + tolerance.lat &&
    point.lng >= bbox.minlng - tolerance.lng &&
    point.lng <= bbox.maxlng + tolerance.lng;
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
