import fs from 'node:fs';
import { Route, RouteType } from '../model/route';
import { OsmRelationMemberRole } from '../osm/osm-object';
import { FileHandle } from 'node:fs/promises';
import { Buf } from '../util/util';

export async function writeRouteWithPoints(routesDir: string, route: Route, points: number[][], roles: (OsmRelationMemberRole | undefined)[]) {
  const fd = await fs.promises.open(routesDir + '/' + route.id + '.route', 'w');
  const bufSize = getRouteBufferSize(route);
  const buf = Buf.of(bufSize);
  writeRouteBuffer(route, buf);
  await fd.write(buf.buffer, 0)
  await writePointsToFile(fd, points, roles, bufSize);
  await fd.close();
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

async function writePointsToFile(fd: FileHandle, points: number[][], roles: (OsmRelationMemberRole | undefined)[], offset: number) {
  let size = 0;
  for (const segment of points) size += 5 + segment.length * 4;
  const buffer = Buffer.allocUnsafe(5 + size);
  buffer.writeUint8(RouteProperty.POINTS, 0);
  buffer.writeUint32LE(size, 1);
  let pos = 5;
  for (let i = 0; i < points.length; ++i) {
    buffer.writeUint8(roles[i] || 0, pos);
    buffer.writeUint32LE(points[i].length, pos + 1);
    pos += 5;
    for (const point of points[i]) {
      buffer.writeInt32LE(point, pos);
      pos += 4;
    }
  }
  return offset + (await fd.write(buffer, offset)).bytesWritten;
}
