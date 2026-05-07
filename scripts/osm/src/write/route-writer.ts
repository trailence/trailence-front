import fs from 'node:fs';
import { Route, RouteType } from '../model/route';
import { OsmRelationMemberRole } from '../osm/osm-object';
import { FileHandle } from 'node:fs/promises';

export async function writeRoute(routesDir: string, route: Route, points: number[][], roles: (OsmRelationMemberRole | undefined)[]) {
  const fd = await fs.promises.open(routesDir + '/' + route.id + '.route');
  let offset = 0;
  offset = await writeTypes(fd, route.types, offset);
  offset = await writeString(fd, RouteProperty.COLOUR, route.colour, offset);
  offset = await writeString(fd, RouteProperty.SYMBOL, route.symbol, offset);
  offset = await writeString(fd, RouteProperty.NAME, route.name, offset);
  offset = await writeString(fd, RouteProperty.REF, route.ref, offset);
  offset = await writePoints(fd, points, roles, offset);
  await fd.close();
}

enum RouteProperty {
  NAME = 1,
  REF = 2,
  COLOUR = 3,
  SYMBOL = 4,
  POINTS = 101,
}

async function writeTypes(fd: FileHandle, types: RouteType[], offset: number) {
  const buffer = Buffer.allocUnsafe(1 + types.length);
  buffer.writeUint8(types.length);
  for (const type of types) buffer.writeUint8(type);
  return offset + (await fd.write(buffer, offset)).bytesWritten;
}

async function writeString(fd: FileHandle, type: RouteProperty, value: string | undefined, offset: number) {
  if (!value) return offset;
  value = value.trim();
  if (!value.length) return offset;
  if (value.length > 255) value = value.substring(0, 256);
  let len: number;
  while ((len = Buffer.byteLength(value, 'utf8')) > 255) {
    value = value.substring(0, value.length - 1);
  }
  const buffer = Buffer.allocUnsafe(2 + len);
  buffer.writeUint8(type, 0);
  buffer.writeUint8(len, 1);
  buffer.write(value, 2, 'utf8');
  return offset + (await fd.write(buffer, offset)).bytesWritten;
}

async function writePoints(fd: FileHandle, points: number[][], roles: (OsmRelationMemberRole | undefined)[], offset: number) {
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
