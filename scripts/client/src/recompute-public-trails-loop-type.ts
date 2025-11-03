import { TrackDto } from 'front/model/dto/track';
import { Config } from './config/config';
import { TrailenceClient } from './trailence/trailence-client';
import { ConsoleProgress } from './utils/progress';
import { Track } from 'front/model/track';
import { FakePreferencesService } from './trailence/preferences';
import { configureWindow } from './utils/window';
import { retry } from './utils/retry';

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

const mode = args['mode'];
if (!mode) throw new Error('Missing --mode');
if (mode !== 'local' && mode !== 'prod') throw new Error('Invalid --mode=' + mode);

await configureWindow();

const config = new Config(mode);
const trailenceClient = new TrailenceClient(config, 'admin');
const preferencesService = new FakePreferencesService();
const loopTypeDetectionModule = await import('front/services/track-edition/path-analysis/loop-type-detection.js');
const trackModule = await import('front/model/track.js');

const nbTrails = await trailenceClient.countTotalPublicTrails();
console.log('Found ' + nbTrails + ' public trails');
const progress = new ConsoleProgress('Recalculate public trails loop type', nbTrails);

let offset = 0;
while (offset < nbTrails) {
  progress.setSubText('Getting ids for next 100 trails');
  const ids = await trailenceClient.getAllPublicTrailsIds(offset, 100);
  progress.setSubText('Fetching ' + ids.length + ' trails');
  const trails = await trailenceClient.getPublicTrails(ids);

  for (let trailIndex = 0; trailIndex < trails.length; ++trailIndex) {
    const trail = trails[trailIndex];
    progress.setSubText('Fetching track ' + (trailIndex + 1) + '/' + ids.length + ' (' + trail.uuid + ')');
    const publicTrack = await retry(async() => await trailenceClient.getPublicTrack(trail.uuid), 2);
    const dto: TrackDto = {
      ...publicTrack,
      owner: 'trailence',
      uuid: trail.uuid,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const track = new trackModule.Track(dto, preferencesService as any);
    progress.setSubText('Detect loop type ' + (trailIndex + 1) + '/' + ids.length);
    const loopType = loopTypeDetectionModule.detectLoopType(track);
    if (loopType && loopType != trail.loopType) {
      console.log('');
      console.log('Trail ' + trail.name + ' has ' + trail.loopType + ' new is ' + loopType);
      trailenceClient.patchPublicTrail(trail.uuid, {loopType});
    }
    progress.addWorkDone(1, '');
  }

  if (ids.length < 100) break;
  offset += 100;
}
progress.done();
