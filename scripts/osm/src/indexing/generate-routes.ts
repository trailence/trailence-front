import readline from 'node:readline';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { parseOpl } from '../osm/opl-parser';
import { OsmRelation, OsmRelationMemberRole, OsmRelationMemberType } from '../osm/osm-object';
import { osmToRoute } from '../osm/osm-to-route';
import { Route } from '../model/route';
import { idToSubWayIndex, idToWayIndex, WayIndexFileReader } from './way-index-file';
import { readFully } from '../util/fs-util';
import { ExtraDataType } from '../write/way-writer';
import { writeRoute } from '../write/route-writer';

const args: {[key: string]: string} = {};
for (const arg of process.argv) {
  if (arg.startsWith('--')) {
    const i = arg.indexOf('=');
    if (i >= 0) {
      const name = arg.substring(2, i);
      const value = arg.substring(i + 1);
      args[name] = value;
    }
  }
}

function expandHome(p: string) {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

const waysIndexDir = expandHome(args['waysIndexDir']);
const waysTilesDir = expandHome(args['waysTilesDir']);
const routesDir = expandHome(args['routesDir']);

const shutingDown: { get: () => boolean } = { get: () => false };

interface RouteToResolve {
  route: Route;
  waysIndexes: number[];
  waysSubIds: number[];
  roles: (OsmRelationMemberRole | undefined)[];
  points: number[][];
}

async function generateRoutes() {
  await fs.promises.mkdir(routesDir);
  const reader = readline.createInterface({
    input: process.stdin,
  });
  let lineCount = 0;
  let routeCount = 0;
  const routes: RouteToResolve[] = [];
  const waysIds = new Set<bigint>();
  const mapByIndex = new Map<number, Set<number>>();
  const waysIndexes = new WayIndexFileReader(waysIndexDir);
  for await (const line of reader) {
    if (!line.trim()) continue;
    if (shutingDown.get()) break;
    lineCount++;
    const osm = parseOpl(line, undefined, undefined, {
      includeTags: true,
      includeNodes: false,
      includeRelations: true,
      includeWays: true,
      filterTags: {
        'route': [
          //'road', 'detour',
          'bicycle', 'mtb',
          'foot', 'hiking', 'fitness_trail', 'walking', 'running', 'nordic_walking',
          // 'ski', 'piste', 'snowshoe', (tags piste:*)
          // 'via_ferrata',
          //'horse',
          //'canoe', 'waterway', 'canyoning',
        ]
      }
    }) as (OsmRelation | undefined);
    if (!osm) continue;
    if (osm.members.length === 0) continue;
    if (osm.members.some(m => m.type !== OsmRelationMemberType.WAY)) continue;
    const route = osmToRoute(osm);
    if (!route) continue;
    const r: RouteToResolve = {
      route,
      waysIndexes: new Array(osm.members.length),
      waysSubIds: new Array(osm.members.length),
      roles: new Array(osm.members.length),
      points: new Array(osm.members.length)
    };
    for (const member of osm.members) {
      const index = idToWayIndex(member.id);
      const subId = idToSubWayIndex(member.id);
      r.waysIndexes.push(index);
      r.waysSubIds.push(subId);
      r.roles.push(member.role);
      let subIds = mapByIndex.get(index);
      if (!subIds) {
        subIds = new Set<number>();
        mapByIndex.set(index, subIds);
      }
      subIds.add(subId);
    }
    routes.push(r);
    routeCount++;
    for (const member of osm.members) waysIds.add(member.id);
    if (waysIds.size > 10000) {
      console.log('Processing', routes.length, 'routes', 'with', waysIds.size, 'ways');
      waysIds.clear();
      await processRoutes(routes, mapByIndex, waysIndexes);
    }
  }
  console.log('===', lineCount, 'lines', routeCount, 'routes');
}

async function processRoutes(
  routes: RouteToResolve[],
  mapByIndex: Map<number, Set<number>>,
  waysIndexes: WayIndexFileReader,
) {
  if (shutingDown.get()) return;
  const subWaysIdsByIndex: {index: number, subIds: number[]}[] = [];
  for (const e of mapByIndex.entries()) {
    subWaysIdsByIndex.push({index: e[0], subIds: Array.from(e[1])});
  }
  mapByIndex.clear();
  subWaysIdsByIndex.sort((k1,k2) => k1.subIds.length < k2.subIds.length ? -1 : (k1.subIds.length > k2.subIds.length ? 1 : (k1.index < k2.index ? -1 : 1)));
  const waysTiles = await waysIndexes.resolveElements(subWaysIdsByIndex, shutingDown);
  if (shutingDown.get()) return;
  console.log('Ways resolved into tiles');
  const mapByTile = new Map<number, Map<number, number[]>>();
  for (const indexEntry of waysTiles.entries()) {
    for (const subIdEntry of indexEntry[1].entries()) {
      let tile = mapByTile.get(subIdEntry[1]);
      if (!tile) {
        tile = new Map<number, number[]>();
        mapByTile.set(subIdEntry[1], tile);
      }
      let wayIndex = tile.get(indexEntry[0]);
      if (wayIndex) {
        wayIndex.push(subIdEntry[0]);
      } else {
        wayIndex = [subIdEntry[0]];
        tile.set(indexEntry[0], wayIndex);
      }
    }
  }
  waysTiles.clear(); // GC
  if (shutingDown.get()) return;
  console.log('Matching routes and ways using', mapByTile.size, 'tiles');
  for (const tileEntry of mapByTile.entries()) {
    const tileNumber = tileEntry[0];
    await processTile(tileNumber, mapByTile.get(tileNumber)!, routes);
  }
  for (const route of routes) {
    await writeRoute(routesDir, route.route, route.points, route.roles);
  }
  routes.splice(0, routes.length);
}

async function processTile(tile: number, waysIdsMap: Map<number, number[]>, routes: RouteToResolve[]) {
  const src = await fs.promises.open(waysTilesDir + '/' + tile + '.tile', 'r');
  const dst = await fs.promises.open(waysTilesDir + '/' + tile + '.tmp', 'w');
  let srcOffset = 0;
  let dstOffset = 0;
  const header = Buffer.allocUnsafe(10);
  do {
    let read = await readFully(src, header, 0, 10, srcOffset);
    if (read === 0) break;
    if (read !== 10) throw new Error('Cannot read ways tile ' + tile + ': only ' + read + ' bytes read at ' + srcOffset);
    srcOffset += 10;
    await dst.write(header, 0, 10, dstOffset);
    dstOffset += 10;

    const wayId = header.readBigInt64LE(0);
    const nbPoints = header.readUInt16LE(8);
    let bufferSize = nbPoints * 8 + 2;
    let buffer = Buffer.allocUnsafe(bufferSize);
    read = await readFully(src, buffer, 0, bufferSize, srcOffset);
    if (read !== bufferSize) throw new Error('Cannot read ways tile ' + tile + ': only ' + read + ' bytes read at ' + srcOffset);
    srcOffset += bufferSize;

    const wayIndex = idToWayIndex(wayId);
    const waySubId = idToSubWayIndex(wayId);
    const subIds = waysIdsMap.get(wayIndex);
    let indexed = false;
    if (subIds) {
      const i = subIds.indexOf(waySubId);
      if (i >= 0) {
        if (subIds.length === 1) {
          waysIdsMap.delete(wayIndex);
        } else {
          subIds.splice(i, 1);
        }
        indexed = true;
      }
    }
    if (indexed) {
      const points: number[] = [];
      for (let i = 0; i < nbPoints; ++i) {
        points.push(buffer.readInt32LE(i * 8), buffer.readInt32LE(i * 8 + 4));
      }
      const linkedRoutes: bigint[] = [];
      for (const route of routes) {
        for (let i = 0; i < route.waysIndexes.length; ++i) {
          if (route.waysIndexes[i] !== wayIndex) continue;
          if (route.waysSubIds[i] !== waySubId) continue;
          route.points[i] = points;
          linkedRoutes.push(route.route.id);
        }
      }
      const extraSizeBefore = buffer.readUInt16LE(bufferSize - 2);
      const extraSizeAfter = extraSizeBefore + 3 + linkedRoutes.length * 8;
      buffer.writeUInt16LE(extraSizeAfter);
      await dst.write(buffer, 0, bufferSize, dstOffset);
      dstOffset += bufferSize;

      buffer = Buffer.allocUnsafe(extraSizeAfter);
      read = await readFully(src, buffer, 0, extraSizeBefore, srcOffset);
      if (read !== extraSizeBefore) throw new Error('Cannot read ways tile ' + tile + ': only ' + read + ' bytes read at ' + srcOffset);
      srcOffset += extraSizeBefore;
      buffer.writeUint8(ExtraDataType.ROUTES, extraSizeBefore);
      buffer.writeUint16LE(linkedRoutes.length, extraSizeBefore + 1);
      for (let i = 0; i < linkedRoutes.length; ++i)
        buffer.writeBigInt64LE(linkedRoutes[i], extraSizeBefore + 3 + i * 8);
      await dst.write(buffer, 0, extraSizeAfter, dstOffset);
      dstOffset += extraSizeAfter;
    } else {
      await dst.write(buffer, 0, bufferSize, dstOffset);
      dstOffset += bufferSize;
      bufferSize = buffer.readUInt16LE(bufferSize - 2);
      buffer = Buffer.allocUnsafe(bufferSize + 2);
      read = await readFully(src, buffer, 0, bufferSize, srcOffset);
      if (read !== bufferSize) throw new Error('Cannot read ways tile ' + tile + ': only ' + read + ' bytes read at ' + srcOffset);
      await dst.write(buffer, 0, bufferSize, dstOffset);
      srcOffset += bufferSize;
      dstOffset += bufferSize;
    }
  } while (true);
  await src.close();
  await dst.close();
  await fs.promises.unlink(waysTilesDir + '/' + tile + '.tile');
  await fs.promises.rename(waysTilesDir + '/' + tile + '.tmp', waysTilesDir + '/' + tile + '.tile');
}

generateRoutes().catch(e => console.error(e)).then(() => {
  console.log('Exiting');
  process.exit(0);
});

let gracefulShutdownStarted = false;
function gracefulShutdown(signal: string) {
  if (gracefulShutdownStarted) {
    console.log(`Received ${signal}, graceful shutdown already started, exiting`);
    process.exit(1);
    return;
  }
  console.log(`Received ${signal}, starting graceful shutdown`);
  shutingDown.get = () => true;
  gracefulShutdownStarted = true;
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
