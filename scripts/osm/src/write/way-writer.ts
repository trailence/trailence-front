import { posTo0125DegTile } from '../model/tiles';
import { Way } from '../model/way';
import { getRouteBufferSize, writeRouteBuffer } from './route-writer';
import { TilesWriter } from './tiles-writer';

export async function wayToTiles(way: Way, tiles: TilesWriter): Promise<number | undefined> {
  const mainTile = posTo0125DegTile(way.points[0] / 1e7, way.points[1] / 1e7);
  const secondaryTiles: number[] = [];
  for (let i = 2; i < way.points.length; i += 2) {
    const tile = posTo0125DegTile(way.points[i] / 1e7, way.points[i + 1] / 1e7);
    if (tile !== mainTile && !secondaryTiles.includes(tile)) secondaryTiles.push(tile);
  }
  await wayToBin(way, mainTile, tiles);
  for (const tile of secondaryTiles)
    await wayReferenceToBin(mainTile, way.id, tile, tiles);
  return mainTile;
}

async function wayToBin(way: Way, tile: number, tiles: TilesWriter) {
  const bytesValues = wayExtraDataByteValues(way);
  const bytesValuesSize = bytesValues.length === 0 ? 0 : 3 + bytesValues.length;
  let nbRoutes = 0;
  let routesSize = 0;
  for (const route of way.routes) {
    const routeSize = 8 + getRouteBufferSize(route);
    if (routesSize + routeSize + bytesValuesSize + 3 > 65535) break;
    routesSize += routeSize;
    nbRoutes++;
  }
  if (routesSize > 0) routesSize += 3;
  const extraSize = bytesValuesSize + routesSize;
  const size = 8 + 2 + way.points.length * 4 + 2 + extraSize;
  const buffer = await tiles.getTileBuffer(tile, size);
  buffer.writeInt64(way.id);
  buffer.writeUInt16(Math.floor(way.points.length / 2));
  for (let i = 0; i < way.points.length; i += 2) {
    buffer.writeInt32(way.points[i]);
    buffer.writeInt32(way.points[i + 1]);
  }
  buffer.writeUInt16(extraSize);
  if (bytesValues.length > 0) {
    buffer.writeUInt8(ExtraDataType.BYTES_VALUES);
    buffer.writeUInt16(bytesValues.length);
    for (const b of bytesValues) buffer.writeUInt8(b);
  }
  if (routesSize > 0) {
    buffer.writeUInt8(ExtraDataType.ROUTES);
    buffer.writeUInt16(routesSize - 3);
    for (let i = 0; i < nbRoutes; ++i) {
      buffer.writeInt64(way.routes[i].id);
      writeRouteBuffer(way.routes[i], buffer);
    }
  }
}

function wayExtraDataByteValues(way: Way): number[] {
  const bytes: number[] = [];
  if (way.footPermission !== undefined)
    bytes.push(ByteProperty.FOOT_PERMISSION, way.footPermission);
  if (way.bicyclePermission !== undefined)
    bytes.push(ByteProperty.BICYCLE_PERMISSION, way.bicyclePermission);
  if (way.type !== undefined)
    bytes.push(ByteProperty.TYPE, way.type);
  if (way.surface !== undefined)
    bytes.push(ByteProperty.SURFACE, way.surface);
  if (way.hikingDifficulty !== undefined)
    bytes.push(ByteProperty.HIKING_DIFFICULTY, way.hikingDifficulty);
  if (way.mtbDifficuly !== undefined)
    bytes.push(ByteProperty.MTB_DIFFICULTY, way.mtbDifficuly);
  if (way.visibility !== undefined)
    bytes.push(ByteProperty.VISIBILITY, way.visibility);
  return bytes;
}

export enum ExtraDataType {
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

async function wayReferenceToBin(mainTile: number, wayId: bigint, tile: number, tiles: TilesWriter) {
  const buffer = await tiles.getTileBuffer(tile, 8 + 2 + 4);
  buffer.writeInt64(wayId);
  buffer.writeUInt16(0); // 0 points means reference
  buffer.writeUInt32(mainTile);
}
