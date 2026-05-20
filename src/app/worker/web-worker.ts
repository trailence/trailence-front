import { convertToJpeg } from './functions/image-to-jpeg';
import { importPhoto } from './functions/import-photo';
import { parsePois } from './functions/parse-pois';
import { simplifyTrack } from './functions/simplify-track';
import { WorkerMessage, WorkerRequest, WorkerResponse } from './worker-request';

export function processWorkerMessage(request: WorkerMessage): Promise<{response: WorkerResponse, transferable: Transferable[]}> {
  let result: Promise<{result: any, transferable: Transferable[]}>;
  switch (request.request) {
    case WorkerRequest.PARSE_POIS:
      result = parsePois(request.payload.blob, request.payload.type, request.payload.south, request.payload.west, request.payload.north, request.payload.east)
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
    default:
      result = Promise.reject(new Error('Unknown worker message: ' + request.request));
      break;
  }
  return result.then(response => ({response: {id: request.id, success: true, payload: response.result, error: undefined}, transferable: response.transferable}))
    .catch(e => ({response: {id: request.id, success: false, payload: undefined, error: e}, transferable: []}));
}
