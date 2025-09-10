import { Config } from './config/config';
import { GeoTrekImport } from './importers/geotrek/geotrek-import';
import { Importer } from './importers/importer';
import { TrailenceClient } from './trailence/trailence-client';

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

const trailenceClient = new TrailenceClient(config, remote);
await trailenceClient.createUserIfNeeded();

const remoteType = config.getRequiredString(remote, 'type');

const jsdomModule = await import('jsdom');
const urlModule = await import('node:url');
const bufferModule = await import('node:buffer');
class CustomResourceLoader extends jsdomModule.ResourceLoader {
  fetch(url: string, options: any) {
    if (url.startsWith('blob:nodedata:')) {
      return bufferModule.resolveObjectURL(url)!.arrayBuffer().then(b => bufferModule.Buffer.from(b));
    }
    return super.fetch(url, options);
  }
}
global.jsdom = new jsdomModule.JSDOM('',{resources: new CustomResourceLoader()});
global.window = jsdom.window;
global.document = window.document;
global.window.URL = urlModule.URL;


let importer: Importer | undefined = undefined;
switch (remoteType) {
  case 'geotrek': importer = new GeoTrekImport(trailenceClient, config, remote, maxPending); break;
  default: throw new Error('Unknown remote type: ' + remoteType);
}

await importer.importTrails();

console.log('Done.');
