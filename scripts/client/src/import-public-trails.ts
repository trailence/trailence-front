import { Config } from './config/config';
import { GeoTrekImport } from './importers/geotrek/geotrek-import';
import { Importer } from './importers/importer';
import { TrailenceClient } from './trailence/trailence-client';
import { configureWindow } from './utils/window';

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

const remote = args['remote'];
if (!remote) throw new Error('Missing --remote');

let maxPending: number;
if (!args['maxpending']) maxPending = 50; else maxPending = parseInt(args['maxpending']);
if (isNaN(maxPending)) maxPending = 50;

const config = new Config(mode);

const adminTrailenceClient = new TrailenceClient(config, 'admin');
const remoteTrailenceClient = new TrailenceClient(config, remote);

await adminTrailenceClient.createUserIfNeeded(remoteTrailenceClient.username, remoteTrailenceClient.password);
const displayName = config.getString(remote, 'displayName');
if (displayName)
  await remoteTrailenceClient.setDisplayName(displayName);

const remoteType = config.getRequiredString(remote, 'type');

await configureWindow();

let importer: Importer | undefined = undefined;
switch (remoteType) {
  case 'geotrek': importer = new GeoTrekImport(remoteTrailenceClient, config, remote, maxPending); break;
  default: throw new Error('Unknown remote type: ' + remoteType);
}

await importer.importTrails();

console.log('Done.');
