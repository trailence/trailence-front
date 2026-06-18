import readline from 'node:readline';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { parseOpl } from '../osm/opl-parser';
import { OsmRelation, OsmRelationMemberRole, OsmRelationMemberType } from '../osm/osm-object';
import { osmToRoute } from '../osm/osm-to-route';
import { Route } from '../model/route';
import { idToSubWayIndex, idToWayIndex, WayIndexFileReader } from './way-index-file';
import { BufferedReader, BufferedWriter, readFully } from '../util/fs-util';
import { ExtraDataType } from '../write/way-writer';
import { getRouteBufferSize, writeRouteBuffer, writeRouteWithPoints } from '../write/route-writer';
import { Buf, durationToString } from '../util/util';

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
  const start = Date.now();
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
    for (let i = 0; i < osm.members.length; ++i) {
      const member = osm.members[i];
      const index = idToWayIndex(member.id);
      const subId = idToSubWayIndex(member.id);
      r.waysIndexes[i] = index;
      r.waysSubIds[i] = subId;
      r.roles[i] = member.role;
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
    if (waysIds.size > 200000) {
      console.log('Processing', routes.length, 'routes', 'with', waysIds.size, 'ways after', lineCount, 'lines');
      waysIds.clear();
      const startRoutes = Date.now();
      await processRoutes(routes, mapByIndex, waysIndexes);
      const end = Date.now();
      console.log(routes.length, 'routes processed in', durationToString(end - startRoutes), 'after', durationToString(end - start));
    }
  }
  if (waysIds.size > 0) {
    console.log('Processing final', routes.length, 'routes', 'with', waysIds.size, 'ways after', lineCount, 'lines');
    waysIds.clear();
    await processRoutes(routes, mapByIndex, waysIndexes);
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
    const sorted = Array.from(e[1]).sort((id1, id2) => id1 < id2 ? -1 : 1);
    subWaysIdsByIndex.push({index: e[0], subIds: sorted});
  }
  mapByIndex.clear();
  subWaysIdsByIndex.sort((k1,k2) => k1.subIds.length < k2.subIds.length ? -1 : (k1.subIds.length > k2.subIds.length ? 1 : (k1.index < k2.index ? -1 : 1)));
  const waysTiles = await waysIndexes.resolveElements(subWaysIdsByIndex, true, shutingDown);
  if (shutingDown.get()) return;
  // remove unresolved routes
  const routesBefore = routes.length;
  routes = routes.filter(route => {
    for (let i = 0; i < route.waysIndexes.length; ++i) {
      const wayIndex = waysTiles.get(route.waysIndexes[i]);
      if (!wayIndex) return false;
      const tileNumber = wayIndex.get(route.waysSubIds[i]);
      if (tileNumber === undefined) return false;
    }
    return true;
  });
  console.log('Ways resolved into tiles, remaining routes', routes.length, '/', routesBefore);
  if (routes.length === 0) return;
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
  let index = 1;
  for (const tileEntry of mapByTile.entries()) {
    const tileNumber = tileEntry[0];
    const waysIdsMap = mapByTile.get(tileNumber);
    process.stdout.clearLine(-1);
    process.stdout.cursorTo(0);
    process.stdout.write(' + Tile ' + index);
    if (waysIdsMap)
      await processTile(tileNumber, waysIdsMap, routes);
    index++;
  }
  process.stdout.clearLine(-1);
  process.stdout.cursorTo(0);
  console.log('Ways updated, writing', routes.length, 'routes');
  for (const route of routes) {
    await writeRouteWithPoints(routesDir, route.route, route.points, route.roles);
  }
  routes.splice(0, routes.length);
}

async function processTile(tile: number, waysIdsMap: Map<number, number[]>, routes: RouteToResolve[]) {
  const src = new BufferedReader(await fs.promises.open(waysTilesDir + '/' + tile + '.tile', 'r'), 128 * 1024);
  const dst = new BufferedWriter(await fs.promises.open(waysTilesDir + '/' + tile + '.tmp', 'w'), 128 * 1024);
  do {
    const header = await src.read(10);
    if (header.length === 0) break;
    if (header.length !== 10) throw new Error('Cannot read ways tile ' + tile + ': only ' + header.length + ' bytes read at ' + (src.offset - header.length) + ', expected 10 bytes for way header');
    dst.write(header, 0, 10);

    const wayId = header.readBigInt64LE(0);
    const nbPoints = header.readUInt16LE(8);
    //console.log('tile', tile, 'offset', srcOffset - 10, 'way', wayId, 'nbPoints', nbPoints);
    if (nbPoints === 0) {
      // way reference
      const tile = await src.read(4);
      if (tile.length !== 4) throw new Error('Cannot read ways tile ' + tile + ': only ' + tile.length + ' bytes read at ' + (src.offset - header.length) + ', expected 4 bytes for main tile reference of way id ' + wayId);
      dst.write(header, 0, 4);
      continue;
    }
    let pointsSize = nbPoints * 8 + 2;
    let pointsBuffer = await src.read(pointsSize);
    if (pointsBuffer.length !== pointsSize) throw new Error('Cannot read ways tile ' + tile + ': only ' + pointsBuffer.length + ' bytes read at ' + (src.offset - pointsBuffer.length) + ', expected ' + pointsSize + ' for way id ' + wayId + ' with ' + nbPoints + ' points');

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
        points.push(pointsBuffer.readInt32LE(i * 8), pointsBuffer.readInt32LE(i * 8 + 4));
      }
      const extraSizeBefore = pointsBuffer.readUInt16LE(pointsSize - 2);
      const linkedRoutes: Route[] = [];
      let linkedRoutesSize = 0;
      for (const route of routes) {
        for (let i = 0; i < route.waysIndexes.length; ++i) {
          if (route.waysIndexes[i] !== wayIndex) continue;
          if (route.waysSubIds[i] !== waySubId) continue;
          route.points[i] = points;
          const routeSize = 8 + getRouteBufferSize(route.route);
          if (linkedRoutesSize + routeSize + extraSizeBefore + 3 <= 65535) {
            linkedRoutes.push(route.route);
            linkedRoutesSize += routeSize;
          }
        }
      }
      const extraSizeAfter = extraSizeBefore + 3 + linkedRoutesSize;
      pointsBuffer.writeUInt16LE(extraSizeAfter, pointsSize - 2);
      dst.write(pointsBuffer, 0, pointsSize);

      const extraBefore = await src.read(extraSizeBefore);
      if (extraBefore.length !== extraSizeBefore) throw new Error('Cannot read ways tile ' + tile + ': only ' + extraBefore.length + ' bytes read at ' + (src.offset - extraBefore.length) + ', expected ' + extraSizeBefore + ' for extra data');
      dst.write(extraBefore, 0, extraSizeBefore);
      const extraAddition = Buf.of(3 + linkedRoutesSize);
      extraAddition.writeUInt8(ExtraDataType.ROUTES);
      extraAddition.writeUInt16(linkedRoutesSize);
      for (const r of linkedRoutes) {
        extraAddition.writeInt64(r.id);
        writeRouteBuffer(r, extraAddition);
      }
      dst.write(extraAddition.buffer, 0, 3 + linkedRoutesSize);
    } else {
      dst.write(pointsBuffer, 0, pointsSize);
      const extraSize = pointsBuffer.readUInt16LE(pointsSize - 2);
      const extra = await src.read(extraSize);
      if (extra.length !== extraSize) throw new Error('Cannot read ways tile ' + tile + ': only ' + extra.length + ' bytes read at ' + (src.offset - extra.length) + ', expected ' + extraSize + ' for extra data');
      dst.write(extra, 0, extraSize);
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
