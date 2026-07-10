import { Route, Way, WayReference } from 'src/app/services/map/way';

export async function parseWays(blob: Blob, south: number, west: number, north: number, east: number): Promise<{ways: Way[], references: WayReference[]}> {
  const ways: Way[] = [];
  const references: WayReference[] = [];
  const data = new DataView(await blob.arrayBuffer());
  const textDecoder = new TextDecoder();

  let offset = 0;
  while (offset < data.byteLength) {
    const id = '' + data.getBigInt64(offset, true);
    const nbPoints = data.getUint16(offset + 8, true);
    if (nbPoints === 0) {
      const tile = data.getUint32(offset + 10, true);
      references.push({id, tile});
      offset += 14;
      continue;
    }
    offset += 10;
    const points: {lat: number, lng: number}[] = new Array(nbPoints);
    for (let i = 0; i < nbPoints; ++i) {
      const lat = data.getInt32(offset, true) / 1e7;
      const lng = data.getInt32(offset + 4, true) / 1e7;
      offset += 8;
      points[i] = {lat,lng};
    }
    const extraSize = data.getUint16(offset, true);
    offset += 2;
    if (!isInBounds(points, south, west, north, east)) {
      offset += extraSize;
      continue;
    }
    const way: Way = {id, points, footPermission: undefined, bicyclePermission: undefined, type: undefined, surface: undefined, hikingDifficulty: undefined, mtbDifficuly: undefined, visibility: undefined, routes: []};
    let extraOffset = 0;
    while (extraOffset < extraSize) {
      const extraType = data.getUint8(offset + extraOffset);
      const extraTypeSize = data.getUint16(offset + extraOffset + 1, true);
      switch (extraType) {
        case ExtraDataType.BYTES_VALUES:
          readBytesProperties(data, offset + extraOffset + 3, Math.floor(extraTypeSize / 2), way);
          break;
        case ExtraDataType.ROUTES:
          readRoutes(data, offset + extraOffset + 3, extraTypeSize, way, textDecoder);
          break;
      }
      extraOffset += 3 + extraTypeSize;
    }
    ways.push(way);
    offset += extraSize;
  }
  return {ways, references};
}

enum ExtraDataType {
  BYTES_VALUES = 1,
  ROUTES = 2,
}

enum ByteProperty {
  FOOT_PERMISSION = 1,
  BICYCLE_PERMISSION = 2,
  TYPE = 3,
  SURFACE = 4,
  HIKING_DIFFICULTY = 5,
  MTB_DIFFICULTY = 6,
  VISIBILITY = 7,
}

function readBytesProperties(data: DataView<ArrayBuffer>, offset: number, nbProperties: number, way: Way) {
  for (let i = 0; i < nbProperties; ++i) {
    const type = data.getUint8(offset + i * 2);
    const value = data.getUint8(offset + i * 2 + 1);
    switch (type) {
      case ByteProperty.FOOT_PERMISSION: way.footPermission = value; break;
      case ByteProperty.BICYCLE_PERMISSION: way.bicyclePermission = value; break;
      case ByteProperty.TYPE: way.type = value; break;
      case ByteProperty.SURFACE: way.surface = value; break;
      case ByteProperty.HIKING_DIFFICULTY: way.hikingDifficulty = value; break;
      case ByteProperty.MTB_DIFFICULTY: way.mtbDifficuly = value; break;
      case ByteProperty.VISIBILITY: way.visibility = value; break;
    }
  }
}

function readRoutes(data: DataView<ArrayBuffer>, offset: number, size: number, way: Way, textDecoder: TextDecoder) {
  let routeOffset = 0;
  while (routeOffset < size) {
    routeOffset += readRoute(data, offset + routeOffset, way, textDecoder);
  }
}

function readRoute(data: DataView<ArrayBuffer>, offset: number, way: Way, textDecoder: TextDecoder): number {
  let size = 0;
  const id = '' + data.getBigInt64(offset, true);
  size += 8;
  const route: Route = {id, types: [], colour: undefined, symbol: undefined, name: undefined, ref: undefined};
  const nbTypes = data.getUint8(offset + size);
  size++;
  for (let i = 0; i < nbTypes; ++i) {
    route.types.push(data.getUint8(offset + size));
    size++;
  }
  const nbStrings = data.getUint8(offset + size);
  size++;
  for (let i = 0; i < nbStrings; ++i) {
    const stringType = data.getUint8(offset + size);
    size++;
    const stringLen = data.getUint8(offset + size);
    size++;
    const text = textDecoder.decode(data.buffer.slice(offset + size, offset + size + stringLen));
    size += stringLen;
    switch (stringType) {
      case RouteProperty.COLOUR: route.colour = text; break;
      case RouteProperty.SYMBOL: route.symbol = text; break;
      case RouteProperty.NAME: route.name = text; break;
      case RouteProperty.REF: route.ref = text; break;
    }
  }
  way.routes.push(route);
  return size;
}

enum RouteProperty {
  NAME = 1,
  REF = 2,
  COLOUR = 3,
  SYMBOL = 4,
}

export function isInBounds(
  points: {lat: number, lng: number}[],
  south: number,
  west: number,
  north: number,
  east: number
): boolean {
  if (points.length === 0) {
    return false;
  }

  const pointInBox = (p: {lat: number, lng: number}): boolean =>
    p.lat >= south &&
    p.lat <= north &&
    p.lng >= west &&
    p.lng <= east;

  // Quick acceptance: any point inside
  for (const p of points) {
    if (pointInBox(p)) {
      return true;
    }
  }

  const boxCorners = [
    { x: west, y: south },
    { x: east, y: south },
    { x: east, y: north },
    { x: west, y: north },
  ];

  const boxEdges = [
    [boxCorners[0], boxCorners[1]], // south
    [boxCorners[1], boxCorners[2]], // east
    [boxCorners[2], boxCorners[3]], // north
    [boxCorners[3], boxCorners[0]], // west
  ] as const;

  function orientation(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number
  ): number {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }

  function onSegment(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    px: number,
    py: number
  ): boolean {
    return (
      px >= Math.min(ax, bx) &&
      px <= Math.max(ax, bx) &&
      py >= Math.min(ay, by) &&
      py <= Math.max(ay, by)
    );
  }

  function segmentsIntersect(
    a1x: number,
    a1y: number,
    a2x: number,
    a2y: number,
    b1x: number,
    b1y: number,
    b2x: number,
    b2y: number
  ): boolean {
    const o1 = orientation(a1x, a1y, a2x, a2y, b1x, b1y);
    const o2 = orientation(a1x, a1y, a2x, a2y, b2x, b2y);
    const o3 = orientation(b1x, b1y, b2x, b2y, a1x, a1y);
    const o4 = orientation(b1x, b1y, b2x, b2y, a2x, a2y);

    if (
      ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
      ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))
    ) {
      return true;
    }

    if (o1 === 0 && onSegment(a1x, a1y, a2x, a2y, b1x, b1y)) return true;
    if (o2 === 0 && onSegment(a1x, a1y, a2x, a2y, b2x, b2y)) return true;
    if (o3 === 0 && onSegment(b1x, b1y, b2x, b2y, a1x, a1y)) return true;
    if (o4 === 0 && onSegment(b1x, b1y, b2x, b2y, a2x, a2y)) return true;

    return false;
  }

  // Check every path segment against every box edge
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];

    for (const [c, d] of boxEdges) {
      if (
        segmentsIntersect(
          a.lng,
          a.lat,
          b.lng,
          b.lat,
          c.x,
          c.y,
          d.x,
          d.y
        )
      ) {
        return true;
      }
    }
  }

  return false;
}
