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
import { WayIndexesWriter } from './way-index-file';
import { MemoryLimiter } from '../util/memory-limiter';
import { durationToString } from '../util/util';

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

const waysTilesDir = expandHome(args['waysTilesDir']);
const waysIndexDir = expandHome(args['waysIndexDir']);
const nodesIndexDir = expandHome(args['nodesIndexDir']);

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
  sortedSubNodesByKey.sort((k1,k2) => k1.index < k2.index ? -1 : 1);
  console.log('Resolving', nodeCount, 'nodes from', sortedSubNodesByKey.length, 'indexes for', waysToProcess.length, 'ways');
  const nodesToPoint = await nodeIndexReader.resolveElements(sortedSubNodesByKey);
  sortedSubNodesByKey = undefined;
  console.log(nodeCount, 'nodes resolved in', durationToString(Date.now() - start), 'writing ways to tiles and indexes...');
  while (waysToProcess.length > 0) {
    const way = waysToProcess.shift()!;
    if (!resolveWayPoints(way.way, way.nodesIndexes, way.nodesSubIndexes, nodesToPoint)) continue;
    const mainTile = await wayToTiles(way.way, tiles);
    if (mainTile !== undefined) {
      await wayIndexes.add(way.way.id, mainTile);
    }
  }
}

function resolveWayPoints(way: Way, nodesIndexes: number[], nodesSubIndexes: number[], resolved: Map<number, Map<number, number[]>>): boolean {
  for (let i = 0; i < nodesIndexes.length; ++i) {
    const point = resolved.get(nodesIndexes[i])?.get(nodesSubIndexes[i]);
    if (!point) {
      console.error('Point not resolved', nodesIndexes[i], nodesSubIndexes[i]);
      return false;
    }
    way.points.push(...point);
  }
  return true;
}

async function generateWays() {
  await fs.promises.mkdir(waysTilesDir);
  await fs.promises.mkdir(waysIndexDir);
  const memoryLimiter = new MemoryLimiter(128 * 1024 * 1024, 256 * 1024 * 1024);
  const tiles = new TilesWriter(waysTilesDir, 4096, memoryLimiter);
  const reader = readline.createInterface({
    input: process.stdin,
  });
  const nodeIndexReader = new NodeIndexFileReader(nodesIndexDir);
  const wayIndexes = new WayIndexesWriter(waysIndexDir, memoryLimiter);
  let linesCount = 0;
  let waysCount = 0;
  let waysToProcess: {way: Way, nodesIndexes: number[], nodesSubIndexes: number[]}[] = [];
  const start = Date.now();
  for await (const line of reader) {
    if (!line.trim()) continue;
    linesCount++;
    const osm = parseOpl(line, undefined, {includeTags: true, includeNodesIds: true}, undefined);
    if (osm instanceof OsmWay) {
      const way = osmToWayWithoutPoints(osm);
      if (way) {
        const toProcess: {way: Way, nodesIndexes: number[], nodesSubIndexes: number[]} = {way, nodesIndexes: [], nodesSubIndexes: []};
        for (const nodeId of osm.nodes) {
          toProcess.nodesIndexes.push(idToNodeIndex(nodeId));
          toProcess.nodesSubIndexes.push(idToSubNodeId(nodeId));
        }
        waysToProcess.push(toProcess);
        waysCount++;
        if (waysToProcess.length >= 1000000) {
          const startProcess = Date.now();
          console.log('Flushing ways after ' + linesCount.toLocaleString() + ' lines; ' + waysCount.toLocaleString() + ' ways; ' + durationToString(startProcess - start));
          const nb = waysToProcess.length;
          await processWays(waysToProcess, nodeIndexReader, tiles, wayIndexes);
          console.log('==>', nb, ' ways processed in', durationToString(Date.now() - startProcess), 'total', waysCount, 'in', durationToString(Date.now() - start));
          waysToProcess = [];
        }
      }
    }
  }
  if (waysToProcess.length > 0)
    await processWays(waysToProcess, nodeIndexReader, tiles, wayIndexes);
  console.log('' + linesCount.toLocaleString() + ' lines found, ' + waysCount.toLocaleString() + ' ways found');
  console.log('Flushing tiles...');
  await tiles.close();
  console.log('Closing node indexes...');
  await nodeIndexReader.close();
  console.log('Closing way indexes...');
  await wayIndexes.close();
  console.log('Done in', durationToString(Date.now() - start));
}

generateWays().catch(e => console.error(e));
