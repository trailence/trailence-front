import { Console } from '../utils/console';
import { matchOsmWays } from '../utils/track-computed-data/match-osm-ways';
import { getTrackOsmStats } from '../utils/track-computed-data/track-osm-stats';
import { convertToJpeg } from './functions/image-to-jpeg';
import { importPhoto } from './functions/import-photo';
import { parsePois } from './functions/parse-pois';
import { parseWays } from './functions/parse-ways';
import { simplifyTrack } from './functions/simplify-track';
import { WorkerMessage, WorkerRequest, WorkerResponse } from './worker-request';

export function processWorkerMessage(request: WorkerMessage): Promise<{response: WorkerResponse, transferable: Transferable[]}> {
  let result: Promise<{result: any, transferable: Transferable[]}>;
  const start = Date.now();
  try {
    switch (request.request) {
      case WorkerRequest.PARSE_POIS:
        result = parsePois(request.payload.blob, request.payload.type, request.payload.south, request.payload.west, request.payload.north, request.payload.east)
          .then(result => ({result, transferable: []}));
        break;
      case WorkerRequest.PARSE_WAYS:
        result = parseWays(request.payload.blob, request.payload.south, request.payload.west, request.payload.north, request.payload.east)
          .then(result => ({result, transferable: []}));
        break;
      case WorkerRequest.SIMPLIFY_TRACK:
        result = simplifyTrack(request.payload)
          .then(result => ({result, transferable: []}));
        break;
      case WorkerRequest.IMPORT_PHOTO:
        result = importPhoto(
          request.payload.owner,
          request.payload.trailUuid,
          request.payload.description,
          request.payload.index,
          request.payload.content,
          request.payload.preferences,
          request.payload.dateTaken,
          request.payload.latitude,
          request.payload.longitude,
          request.payload.isCover,
          request.payload.photoUuid,
        ).then(result => ({result, transferable: [result.jpeg]}));
        break;
      case WorkerRequest.CONVERT_JPEG:
        result = convertToJpeg(request.payload.image, request.payload.maxWidth, request.payload.maxHeight, request.payload.quality, request.payload.minWidth, request.payload.minHeight)
        .then(result => ({result, transferable: [result.jpeg]}));
        break;
      case WorkerRequest.MATCH_OSM_WAYS:
        result = Promise.resolve({result: matchOsmWays(request.payload.track, request.payload.osmWays), transferable: []});
        break;
      case WorkerRequest.TRACK_OSM_STATS:
        result = Promise.resolve({result: getTrackOsmStats(request.payload.ways, request.payload.osmTrackPoints, request.payload.isPartial), transferable: []});
        break;
      default:
        result = Promise.reject(new Error('Unknown worker message: ' + request.request));
        break;
    }
  } catch (e) {
    result = Promise.reject(e);
  }
  return result
  .then(response => {
    const time = Date.now() - start;
    Console.info('[WORKER] request ' + request.request + ' (id ' + request.id + ') processed in ' + time + 'ms.');
    return {response: {id: request.id, success: true, payload: response.result, error: undefined}, transferable: response.transferable};
  })
  .catch(e => {
    Console.error('Error processing request', request, e);
    return {response: {id: request.id, success: false, payload: undefined, error: e}, transferable: []};
  });
}
