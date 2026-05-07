import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { parseOpl } from '../osm/opl-parser';
import { OsmNode } from '../osm/osm-object';
import { NodeIndexesWriter } from './node-index-file';
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

const out = expandHome(args['out']);

async function indexNodes() {
  await fs.promises.mkdir(out);
  const reader = readline.createInterface({
    input: process.stdin,
  });
  let linesCount = 0;
  let nodesCount = 0;
  const memoryLimiter = new MemoryLimiter(768 * 1024 * 1024, 1024 * 1024 * 1024);
  const indexes = new NodeIndexesWriter(out, memoryLimiter);
  const start = Date.now();
  for await (const line of reader) {
    if (!line.trim()) continue;
    linesCount++;
    const osm = parseOpl(line, {includeTags: false}, undefined);
    if (osm instanceof OsmNode) {
      await indexes.add(osm);
      if (++nodesCount % 10000000 === 0) {
        console.log('lines processed so far: ' + linesCount.toLocaleString() + '; ' + nodesCount.toLocaleString() + ' nodes, ' + durationToString(Date.now() - start));
      }
    }
  }
  console.log('Done: ' + linesCount.toLocaleString() + ' lines processed, ' + nodesCount.toLocaleString() + ' nodes');
  await indexes.close();
}

indexNodes().catch(e => console.error(e));
