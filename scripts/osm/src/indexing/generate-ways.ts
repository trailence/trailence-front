import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import os from 'node:os';
import { parseOpl } from '../osm/opl-parser';
import { OsmWay } from '../osm/osm-object';
import { osmToWayWithoutPoints } from '../osm/osm-to-way';
import { wayToTiles } from '../write/way-writer';
import { TilesWriter } from '../write/tiles-writer';
import { Way } from '../model/way';
import { idToNodeIndex, idToSubNodeId, NodeIndexFileReader } from './node-index-file';
import { WayIndexesWriter, wayIndexToId } from './way-index-file';
import { MemoryLimiter } from '../util/memory-limiter';
import { durationToString } from '../util/util';
import { getFileSize, listFiles, readFully } from '../util/fs-util';
import { PromiseLimiter, PromiseParallel } from '../util/promise-limiter';

const args: {[key: string]: string} = {};
const flags = new Set<string>();
for (const arg of process.argv) {
  if (arg.startsWith('--')) {
    const i = arg.indexOf('=');
    if (i >= 0) {
      const name = arg.substring(2, i);
      const value = arg.substring(i + 1);
      args[name] = value;
    } else {
      flags.add(arg.substring(2));
    }
  }
}

function expandHome(p: string) {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

const waysTilesDir = expandHome(args['waysTilesDir']);
const waysIndexDir = expandHome(args['waysIndexDir']);
const nodesIndexDir = expandHome(args['nodesIndexDir']);
let resumeFromId: bigint = 0n;
let WAYS_PER_ROUND = 1000000;
if (args['waysPerRound'] && !Number.isNaN(Number.parseInt(args['waysPerRound'])))
  WAYS_PER_ROUND = Number.parseInt(args['waysPerRound']);
let STOP_AFTER_WAYS = -1;
if (args['stopAfterWays'] && !Number.isNaN(Number.parseInt(args['stopAfterWays'])))
  STOP_AFTER_WAYS = Number.parseInt(args['stopAfterWays']);

const shutingDown: { get: () => boolean } = { get: () => false };

async function generateWays() {
  const listUnknownHighways = flags.has('list-unknown-highways');
  if (!flags.has('resume') && !listUnknownHighways) {
    await fs.promises.mkdir(waysTilesDir);
    await fs.promises.mkdir(waysIndexDir);
  }
  const memoryLimiter = new MemoryLimiter(128 * 1024 * 1024, 256 * 1024 * 1024);
  const tiles = new TilesWriter(waysTilesDir, 8192, memoryLimiter);
  const reader = readline.createInterface({
    input: process.stdin,
  });
  const nodeIndexReader = new NodeIndexFileReader(nodesIndexDir);
  const wayIndexes = new WayIndexesWriter(waysIndexDir, memoryLimiter);
  let linesCount = 0;
  let waysCount = 0;
  let waysToProcess: {way: Way, nodesIndexes: number[], nodesSubIndexes: number[]}[] = [];
  const start = Date.now();
  const unknownHighways = new Map<string, number>();
  for await (const line of reader) {
    if (shutingDown.get()) break;
    if (!line.trim()) continue;
    linesCount++;
    if ((linesCount % WAYS_PER_ROUND) === 0) console.log(linesCount, 'lines');
    const osm = parseOpl(line, undefined, {includeTags: true, includeNodesIds: !listUnknownHighways}, undefined);
    if (osm instanceof OsmWay) {
      if (osm.id < resumeFromId)  continue;
      if (osm.nodes.length > 65535) {
        console.log('Way contains too many nodes', osm.id, osm.nodes.length);
        continue;
      }
      if (osm.nodes.length === 0) {
        continue;
      }
      const way = osmToWayWithoutPoints(osm, unknownHighways);
      if (listUnknownHighways) continue;
      if (way) {
        const toProcess: {way: Way, nodesIndexes: number[], nodesSubIndexes: number[]} = {way, nodesIndexes: [], nodesSubIndexes: []};
        for (const nodeId of osm.nodes) {
          toProcess.nodesIndexes.push(idToNodeIndex(nodeId));
          toProcess.nodesSubIndexes.push(idToSubNodeId(nodeId));
        }
        waysToProcess.push(toProcess);
        waysCount++;
        if (STOP_AFTER_WAYS > 0 && waysCount >= STOP_AFTER_WAYS) break;
        if (waysToProcess.length >= WAYS_PER_ROUND) {
          const startProcess = Date.now();
          console.log('Flushing ways after ' + linesCount.toLocaleString() + ' lines; ' + waysCount.toLocaleString() + ' ways; ' + durationToString(startProcess - start) + '; ' + new Date().toISOString());
          const nb = waysToProcess.length;
          await processWays(waysToProcess, nodeIndexReader, tiles, wayIndexes);
          console.log('==>', nb, ' ways processed in', durationToString(Date.now() - startProcess), 'total', waysCount, 'in', durationToString(Date.now() - start));
          waysToProcess = [];
          await tiles.flushIfNeeded(125000, 80000);
        }
      }
    }
  }
  if (waysToProcess.length > 0 && !shutingDown.get())
    await processWays(waysToProcess, nodeIndexReader, tiles, wayIndexes);
  console.log('' + linesCount.toLocaleString() + ' lines found, ' + waysCount.toLocaleString() + ' ways found');
  console.log('Flushing tiles...');
  await tiles.close();
  console.log('Closing node indexes...');
  await nodeIndexReader.close();
  console.log('Closing way indexes...');
  await wayIndexes.close();
  console.log('Done in', durationToString(Date.now() - start));
  console.log('Unknown highways found:');
  for (const h of unknownHighways.entries()) {
    console.log('<' + h[0] + '>', h[1]);
  }
}

async function processWays(waysToProcess: {way: Way, nodesIndexes: number[], nodesSubIndexes: number[]}[], nodeIndexReader: NodeIndexFileReader, tiles: TilesWriter, wayIndexes: WayIndexesWriter) {
  let nodesByKey: Map<number, Set<number>> | undefined = new Map<number, Set<number>>();
  for (const w of waysToProcess) {
    for (let i = 0; i < w.nodesIndexes.length; ++i) {
      let toResolve = nodesByKey.get(w.nodesIndexes[i]);
      if (!toResolve) {
        toResolve = new Set<number>();
        nodesByKey.set(w.nodesIndexes[i], toResolve);
      }
      toResolve.add(w.nodesSubIndexes[i]);
    }
  }
  let nodeCount = 0;
  let sortedSubNodesByKey: {index: number; subIds: number[]}[] | undefined = [];
  for (const entry of nodesByKey.entries()) {
    const sorted = Array.from(entry[1]).sort((id1, id2) => id1 < id2 ? -1 : 1);
    sortedSubNodesByKey.push({index: entry[0], subIds: sorted});
    nodeCount += sorted.length;
  }
  nodesByKey = undefined; // GC
  const start = Date.now();
  sortedSubNodesByKey.sort((k1,k2) => k1.subIds.length < k2.subIds.length ? -1 : (k1.subIds.length > k2.subIds.length ? 1 : (k1.index < k2.index ? -1 : 1)));
  if (shutingDown.get()) return;
  console.log('Resolving', nodeCount, 'nodes from', sortedSubNodesByKey.length, 'indexes for', waysToProcess.length, 'ways');
  const nodesToPoint = await nodeIndexReader.resolveElements(sortedSubNodesByKey, false, shutingDown);
  sortedSubNodesByKey = undefined;
  console.log(nodeCount, 'nodes resolved in', durationToString(Date.now() - start), 'writing ways to tiles and indexes...');
  const start2 = Date.now();
  let lastLog = start2;
  let index = 0;
  while (index < waysToProcess.length && !shutingDown.get()) {
    const now = Date.now();
    if (now - lastLog >= 60000) {
      console.log(waysToProcess.length - index, 'ways to process after', durationToString(now - start2));
      lastLog = now;
    }
    const way = waysToProcess[index++];
    if (!resolveWayPoints(way.way, way.nodesIndexes, way.nodesSubIndexes, nodesToPoint)) continue;
    const mainTile = await wayToTiles(way.way, tiles);
    if (mainTile !== undefined) {
      await wayIndexes.add(way.way.id, mainTile);
    }
    if (index > 250000) { // to reduce memory
      waysToProcess.splice(0, index);
      index = 0;
    }
  }
}

function resolveWayPoints(way: Way, nodesIndexes: number[], nodesSubIndexes: number[], resolved: Map<number, Map<number, number[]>>): boolean {
  way.points = new Array(nodesIndexes.length * 2);
  for (let i = 0; i < nodesIndexes.length; ++i) {
    const point = resolved.get(nodesIndexes[i])?.get(nodesSubIndexes[i]);
    if (!point) {
      console.error('Point not resolved', nodesIndexes[i], nodesSubIndexes[i]);
      return false;
    }
    way.points[i * 2] = point[0];
    way.points[i * 2 + 1] = point[1];
  }
  return true;
}

async function getMaxIdFromIndexes(): Promise<bigint> {
  const files = await listFiles(waysIndexDir);
  const indexes = files.map(name => Number.parseInt(name)).filter(i => !Number.isNaN(i) && i > 0).sort((i1,i2) => i2 - i1);
  let maxId: bigint | undefined = undefined;
  for (const indexName of indexes) {
    const path = waysIndexDir + '/' + indexName;
    const fileSize = await getFileSize(path);
    if (!fileSize || fileSize < 8) continue;
    const fd = await fs.promises.open(path, 'r');
    const buffer = Buffer.allocUnsafe(4);
    await readFully(fd, buffer, 0, 4, fileSize - 8);
    maxId = wayIndexToId(indexName, buffer.readUint32LE(0));
    await fd.close();
    break;
  }
  if (maxId !== undefined) return maxId;
  throw new Error('Cannot find max index id');
}

async function getMaxIdFromTiles(): Promise<{main: bigint, ref: bigint}> {
  const files = await listFiles(waysTilesDir);
  const tiles = files.filter(name => name.endsWith('.tile')).map(name => Number.parseInt(name.substring(0, name.length - 5))).filter(i => !Number.isNaN(i) && i > 0);
  console.log(tiles.length, 'way tiles to analyze');
  const fileOperations = new PromiseParallel(4);
  const maxIds$ = tiles.map(tile => getMaxIdFromTile(waysTilesDir + '/' + tile + '.tile', fileOperations));
  const result = {main: 0n, ref: 0n};
  let done = 0;
  for (const maxId$ of maxIds$) {
    const ids = await maxId$;
    if ((++done % 1000) === 0) {
      console.log(done, 'tiles analyzed');
    }
    if (ids.main > result.main) result.main = ids.main;
    if (ids.ref > result.ref) result.ref = ids.ref;
  }
  return result;
}

async function getMaxIdFromTile(file: string, fileOperations: PromiseLimiter): Promise<{main: bigint, ref: bigint}> {
  const buffer = await (fileOperations.push(() => fs.promises.readFile(file)));
  let offset = 0;
  let maxMainId: bigint = 0n;
  let maxReferenceId: bigint = 0n;
  do {
    if (buffer.byteLength - offset === 0) break;
    if (buffer.byteLength - offset < 10) throw new Error('Only ' + (buffer.byteLength - offset) + ' bytes at ' + offset + ' from ' + file);
    offset += 10;
    const id = buffer.readBigInt64LE(offset);
    const nbPoints = buffer.readUint16LE(offset + 8);
    if (nbPoints === 0) {
      // reference
      if (id > maxReferenceId) maxReferenceId = id;
      offset += 4;
      continue;
    }
    offset += nbPoints * 8;
    if (buffer.byteLength - offset < 2) throw new Error('Only ' + (buffer.byteLength - offset) + ' bytes at ' + offset + ' from ' + file);
    const extraSize = buffer.readUint16LE(offset);
    offset += 2 + extraSize;
    if (id > maxMainId) maxMainId = id;
  } while (true);
  if (offset === 0) {
    console.log('remove empty tile', file);
    await fs.promises.unlink(file);
    return {main: 0n, ref: 0n};
  }
  return {main: maxMainId, ref: maxReferenceId};
}


async function truncateTiles(maxId: bigint) {
  const files = await listFiles(waysTilesDir);
  const tiles = files.filter(name => name.endsWith('.tile')).map(name => Number.parseInt(name.substring(0, name.length - 5))).filter(i => !Number.isNaN(i) && i > 0);
  await Promise.all(tiles.map(tile => truncateTile(waysTilesDir + '/' + tile + '.tile', maxId)));
}

async function truncateTile(file: string, maxId: bigint) {
  const fd = await fs.promises.open(file, 'r');
  const header = Buffer.allocUnsafe(10);
  let offset = 0;
  let found = false;
  do {
    let read = await readFully(fd, header, 0, 10, offset);
    if (read === 0) break;
    if (read < 10) throw new Error('Only ' + read + ' bytes read at ' + offset + ' from ' + file);
    const id = header.readBigInt64LE(0);
    if (id > maxId) {
      found = true;
      break;
    }
    const nbPoints = header.readUint16LE(8);
    offset += 10;
    if (nbPoints === 0) {
      // reference
      offset += 4;
      continue;
    }
    offset += nbPoints * 4;
    read = await readFully(fd, header, 0, 2, offset);
    if (read < 2) throw new Error('Only ' + read + ' bytes read at ' + offset + ' from ' + file);
    const extraSize = header.readUint16LE(0);
    offset += 2 + extraSize;
  } while (true);
  await fd.close();
  if (found) {
    console.log('truncate tile', file, 'at', offset);
    if (offset === 0)
      await fs.promises.unlink(file);
    else
      await fs.promises.truncate(file, offset);
  } else if (offset === 0) {
    console.log('remove empty tile', file);
    await fs.promises.unlink(file);
  }
}

async function truncateIndexes(maxId: bigint) {
  const files = await listFiles(waysIndexDir);
  const indexes = files.map(name => Number.parseInt(name)).filter(i => !Number.isNaN(i) && i > 0).sort((i1,i2) => i2 - i1);
  for (const indexName of indexes) {
    const path = waysIndexDir + '/' + indexName;
    const indexMinId = wayIndexToId(indexName, 0);
    if (indexMinId > maxId) {
      console.log('Remove index', indexName);
      await fs.promises.unlink(path);
      continue;
    }
    const indexMaxId = wayIndexToId(indexName + 1, 0) - 1n;
    if (indexMaxId <= maxId) break;
    const fd = await fs.promises.open(path, 'r');
    const buffer = Buffer.allocUnsafe(8);
    let offset = 0;
    let found = false;
    do {
      const read = await readFully(fd, buffer, 0, 8, offset);
      if (read === 0) break;
      if (read !== 8) throw new Error('Only ' + read + ' bytes read at ' + offset + ' from ' + path);
      const subId = buffer.readUint32LE(0);
      const id = wayIndexToId(indexName, subId);
      if (id > maxId) {
        found = true;
        break;
      }
      offset += 8;
    } while (true);
    await fd.close();
    if (found) {
      console.log('truncate index', indexMaxId, 'at', offset);
      if (offset === 0)
        await fs.promises.unlink(path);
      else
        await fs.promises.truncate(path, offset);
    }
    break;
  }
}

async function computeResumeId(firstPass: boolean) {
  console.log('Searching max id in ways tiles...');
  const maxIdFromTiles$ = getMaxIdFromTiles().then(max => {
    console.log('Max id from tiles', max);
    return max;
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
  console.log('Searching max id in ways indexes...');
  const maxIdFromIndex$ = getMaxIdFromIndexes().then(max => {
    console.log('Max id from indexes', max);
    return max;
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
  const maxIds = await Promise.all([maxIdFromTiles$, maxIdFromIndex$]);
  const maxIdFromTiles = maxIds[0];
  const maxIdFromIndex = maxIds[1];
  if (!firstPass && maxIdFromIndex == maxIdFromTiles.main && maxIdFromIndex >= maxIdFromTiles.ref) {
    console.log('Second pass checking max id is correct');
    return maxIdFromIndex;
  }
  let minMaxId = maxIdFromIndex;
  if (maxIdFromTiles.main < minMaxId) minMaxId = maxIdFromTiles.main;
  if (maxIdFromTiles.ref < minMaxId) minMaxId = maxIdFromTiles.ref;
  if (minMaxId == 0n) throw new Error('Max id is 0... cannot resume');
  minMaxId -= BigInt(WAYS_PER_ROUND); // make sure we redo at least the last round
  if (minMaxId <= 0n) throw new Error('Max id is too small to resume');
  console.log('Truncate indexes');
  await truncateIndexes(minMaxId);
  console.log('Truncate tiles');
  await truncateTiles(minMaxId);
  console.log('Re-check max ids')
  return await computeResumeId(false);
}

let p: Promise<any> = Promise.resolve();
if (flags.has('resume'))
  p = p.then(() => computeResumeId(true))
  .then(maxId => {
    resumeFromId = maxId;
    console.log('Resuming from id', resumeFromId);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });

p = p.then(() => generateWays());

p.catch(e => console.error(e)).then(() => {
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
