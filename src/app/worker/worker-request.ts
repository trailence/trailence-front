export interface WorkerMessage {
  request: WorkerRequest;
  id: number;
  payload: any;
}

export interface WorkerResponse {
  id: number;
  success: boolean;
  payload: any;
  error: any;
}

export enum WorkerRequest {
  PARSE_POIS = 'parse-pois',
  PARSE_WAYS = 'parse-ways',
  SIMPLIFY_TRACK = 'simplify-track',
  IMPORT_PHOTO = 'import-photo',
  CONVERT_JPEG = 'convert-jpeg',
  MATCH_OSM_WAYS = 'match_osm_ways',
  TRACK_OSM_STATS = 'track_osm_stats',
}
