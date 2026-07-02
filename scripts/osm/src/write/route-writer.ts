import fs from 'node:fs';
import { Route, RouteType } from '../model/route';
import { OsmRelationMemberRole } from '../osm/osm-object';
import { Buf } from '../util/util';
import { PromiseLimiter } from '../util/promise-limiter';

export async function writeRouteWithPoints(routesDir: string, route: Route, points: Buffer[], roles: (OsmRelationMemberRole | undefined)[], limiter: PromiseLimiter) {
  const metaSize = getRouteBufferSize(route);
  const pointsSize = getBufferSizeForPoints(points);
  const buffer = Buffer.allocUnsafe(metaSize + pointsSize);
  writeRouteBuffer(route, new Buf(buffer, 0));
  writePoints(buffer, metaSize, points, roles);
  const subDir = Number(route.id % 1000n);
  await limiter.push(async () => {
    await (fs.promises.mkdir(routesDir + '/' + subDir).catch(_ => true));
    const fd = await fs.promises.open(routesDir + '/' + subDir + '/' + route.id + '.route', 'w');
    await fd.write(buffer)
    await fd.close();
  });
}

export function getRouteBufferSize(route: Route): number {
  return getTypesBufferSize(route.types) +
    1 +
    getStringBufferSize(route.colour) +
    getStringBufferSize(route.symbol) +
    getStringBufferSize(route.name) +
    getStringBufferSize(route.ref);
}

export function writeRouteBuffer(route: Route, buf: Buf) {
  writeTypesBuffer(route.types, buf);
  const nbStringsOffset = buf.offset;
  buf.offset++;
  let nbStrings = 0;
  if (writeStringBuffer(RouteProperty.COLOUR, route.colour, buf)) nbStrings++;
  if (writeStringBuffer(RouteProperty.SYMBOL, route.symbol, buf)) nbStrings++;
  if (writeStringBuffer(RouteProperty.NAME, route.name, buf)) nbStrings++;
  if (writeStringBuffer(RouteProperty.REF, route.ref, buf)) nbStrings++;
  buf.buffer.writeUint8(nbStrings, nbStringsOffset);
}

enum RouteProperty {
  NAME = 1,
  REF = 2,
  COLOUR = 3,
  SYMBOL = 4,
  POINTS = 101,
}

function getTypesBufferSize(types: RouteType[]): number {
  return 1 + types.length;
}

function writeTypesBuffer(types: RouteType[], buf: Buf) {
  buf.writeUInt8(types.length);
  for (const type of types) buf.writeUInt8(type);
}

function getStringBufferSize(value: string | undefined): number {
  if (!value) return 0;
  value = value.trim();
  if (!value.length) return 0;
  if (value.length > 255) value = value.substring(0, 256);
  let len: number;
  while ((len = Buffer.byteLength(value, 'utf8')) > 255) {
    value = value.substring(0, value.length - 1);
  }
  return 2 + len;
}

function writeStringBuffer(type: RouteProperty, value: string | undefined, buf: Buf): boolean {
  if (!value) return false;
  value = value.trim();
  if (!value.length) return false;
  if (value.length > 255) value = value.substring(0, 256);
  let len: number;
  while ((len = Buffer.byteLength(value, 'utf8')) > 255) {
    value = value.substring(0, value.length - 1);
  }
  buf.writeUInt8(type);
  buf.writeUInt8(len);
  buf.writeString(value);
  return true;
}

function getBufferSizeForPoints(points: Buffer[]) {
  let size = 5;
  for (const segment of points) size += 5 + segment.length;
  return size;
}

function writePoints(buffer: Buffer, offset: number, points: Buffer[], roles: (OsmRelationMemberRole | undefined)[]) {
  let size = 0;
  for (const segment of points) size += 5 + segment.length;
  buffer.writeUint8(RouteProperty.POINTS, offset);
  buffer.writeUint32LE(size, offset + 1);
  offset += 5;
  for (let i = 0; i < points.length; ++i) {
    buffer.writeUint8(roles[i] || 0, offset);
    buffer.writeUint32LE(Math.floor(points[i].length / 8), offset + 1);
    points[i].copy(buffer, offset + 5);
    offset += 5 + points[i].length;
  }
}
