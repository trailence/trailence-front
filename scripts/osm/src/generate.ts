import fs from 'node:fs';
import readline from 'node:readline';
import { parseOpl } from './osm/opl-parser';
import { OsmObject } from './osm/osm-object';
import { TilesWriter } from './write/tiles-writer';
import { DrinkingWater, Guidepost, Toilets } from './model/pois';
import { osmToDrinkingWater, osmToGuidepost, osmToToilets } from './osm/osm-to-pois';
import { posTo2DegTile } from './model/tiles';
import { drinkingWaterToBin, guidepostToBin, toiletsToBin } from './write/poi-writer';
import { MemoryLimiter } from './util/memory-limiter';

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

const dir = args['dir'];
const type = args['type'];

if (!dir || !type) throw new Error('Missing dir or type parameter');

async function generate<T>(osmToType: (osm: OsmObject) => T | undefined, elementToTiles: (element: T, tiles: TilesWriter) => Promise<boolean>) {
  await fs.promises.mkdir(dir);
  const memoryLimiter = new MemoryLimiter(512 * 1024 * 1024, 768 * 1024 * 1024);
  const tiles = new TilesWriter(dir, 4096, memoryLimiter);
  const reader = readline.createInterface({
    input: process.stdin,
  });
  let linesCount = 0;
  let recordCount = 0;
  for await (const line of reader) {
    if (!line.trim()) continue;
    const osm = parseOpl(line, {includeTags: true}, undefined, undefined);
    if (osm) {
      const element = osmToType(osm);
      if (element) {
        if (await elementToTiles(element, tiles))
          recordCount++;
      }
    }
    if (++linesCount % 25000 === 0) {
      console.log('lines processed so far: ' + linesCount + ', ' + type + ': ' + recordCount);
    }
  }
  console.log('Done, flushing tiles...');
  await tiles.close();
  console.log('Done: ' + linesCount + ' lines processed, ' + type + ': ' + recordCount);
}

let generatePromise: Promise<any>;
switch (type) {
  case 'guidepost':
    generatePromise = generate<Guidepost>(
      osmToGuidepost,
      (poi, tiles) => guidepostToBin(poi, posTo2DegTile(poi.lat, poi.lon), tiles),
    );
    break;
  case 'toilets':
    generatePromise = generate<Toilets>(
      osmToToilets,
      (poi, tiles) => toiletsToBin(poi, posTo2DegTile(poi.lat, poi.lon), tiles),
    );
    break;
  case 'drinking_water':
    generatePromise = generate<DrinkingWater>(
      osmToDrinkingWater,
      (poi, tiles) => drinkingWaterToBin(poi, posTo2DegTile(poi.lat, poi.lon), tiles),
    );
    break;
  default: throw new Error('Unknown type: ' + type);
}

generatePromise.catch(e => console.error(e));
