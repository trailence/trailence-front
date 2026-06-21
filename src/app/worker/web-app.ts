import { Injectable } from '@angular/core';
import { WorkerMessage, WorkerRequest } from './worker-request';
import { Console } from '../utils/console';
import { Track } from '../model/track';
import { SimplifiedTrackSnapshot } from '../model/snapshots';
import { ComputedPreferences } from '../services/preferences/preferences';
import { Photo } from '../model/photo';
import { TranslatedString } from '../services/i18n/i18n-string';
import { PhotoDto } from '../model/dto/photo';
import { Way, WayReference } from '../services/map/way';
import { POI, POIType } from '../services/map/poi';
import { EarthPoint } from '../utils/latlng';
import { OsmWaysTrackPoint } from '../utils/track-computed-data/match-osm-ways';
import { TrackOsmStats } from '../utils/track-computed-data/track-osm-stats';

@Injectable({providedIn: 'root'})
export class WorkerService {

  public readonly maxWorkers = Math.min(4, Math.max((navigator.hardwareConcurrency || 2) - 1, 1));
  private readonly workers: WorkerInstance[] = [];
  private readonly queue: Work[] = [];

  constructor() {
    Console.info('[WORKER] max workers', this.maxWorkers, 'for', navigator.hardwareConcurrency, 'cpus');
    (globalThis as any).__workerCoverage = () => this._codeCoverage().then(result => (globalThis as any).__workerCoverageResult = result);
  }

  public parsePois(blob: Blob, type: POIType, bounds: L.LatLngBounds): Promise<POI[]> {
    return this.request<POI[]>({
      request: WorkerRequest.PARSE_POIS,
      payload: {blob, type, south: bounds.getSouth(), north: bounds.getNorth(), east: bounds.getEast(), west: bounds.getWest()},
      transferable: [blob]
    });
  }

  public parseWays(blob: Blob, bounds: L.LatLngBounds): Promise<{ways: Way[], references: WayReference[]}> {
    return this.request<{ways: Way[], references: WayReference[]}>({
      request: WorkerRequest.PARSE_WAYS,
      payload: {blob, south: bounds.getSouth(), north: bounds.getNorth(), east: bounds.getEast(), west: bounds.getWest()},
      transferable: [blob]
    });
  }

  public matchOsmWays(track: EarthPoint[][], osmWays: Way[]): Promise<OsmWaysTrackPoint[][]> {
    return this.request<OsmWaysTrackPoint[][]>({
      request: WorkerRequest.MATCH_OSM_WAYS,
      payload: {track, osmWays},
      transferable: [],
    });
  }

  public getTrackOsmStats(ways: Map<string, Way>, osmTrackPoints: OsmWaysTrackPoint[][], isPartial: boolean, osmDataVersion: number | undefined): Promise<TrackOsmStats> {
    return this.request<TrackOsmStats>({
      request: WorkerRequest.TRACK_OSM_STATS,
      payload: {ways, osmTrackPoints, isPartial, osmDataVersion},
      transferable: [],
    });
  }

  public simplifyTrack(track: Track): Promise<SimplifiedTrackSnapshot> {
    return this.request<SimplifiedTrackSnapshot>({
      request: WorkerRequest.SIMPLIFY_TRACK,
      payload: track.getAllPoints().map(p => ({lat: p.pos.lat, lng: p.pos.lng, ele: p.ele, time: p.time})),
      transferable: []
    });
  }

  public importPhoto( // NOSONAR
    owner: string, trailUuid: string,
    description: string, index: number,
    content: ArrayBuffer,
    preferences: ComputedPreferences,
    dateTaken?: number, latitude?: number, longitude?: number,
    isCover?: boolean,
    photoUuid?: string,
    fromRecording?: boolean,
  ): Promise<{blob: Blob, photo: Photo}> {
    return this.request<{jpeg: ArrayBuffer, photo: PhotoDto}>({
      request: WorkerRequest.IMPORT_PHOTO,
      payload: {owner, trailUuid, description, index, content, preferences, dateTaken, latitude, longitude, isCover, photoUuid},
      transferable: [content],
    })
    .then(result => ({
      blob: new Blob([result.jpeg], {type: 'image/jpeg'}),
      photo: new Photo({
        ...result.photo,
        owner,
        uuid: photoUuid,
        trailUuid,
      }, false, fromRecording)
    }))
    .catch(e => {
      if (typeof e === 'object' && e['i18nKey']) return Promise.reject(new TranslatedString(e['18nKey']));
      return Promise.reject(e);
    })
  }

  public convertToJpeg(image: Blob, maxWidth?: number, maxHeight?: number, quality?: number, minWidth?: number, minHeight?: number): Promise<{blob: Blob, width: number, height: number}> {
    return this.request<{jpeg: ArrayBuffer, width: number, height: number}>({
      request: WorkerRequest.CONVERT_JPEG,
      payload: {image, maxWidth, maxHeight, quality, minWidth, minHeight},
      transferable: [image]
    })
    .then(result => ({
      blob: new Blob([result.jpeg], {type: 'image/jpeg'}),
      width: result.width,
      height: result.height,
    }));
  }

  public _codeCoverage(): Promise<string[]> {
    return this.request<string[]>({
      request: WorkerRequest._CODE_COVERAGE,
      payload: {},
      transferable: []
    });
  }

  private request<R>(request: Request): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      if (request.request === WorkerRequest._CODE_COVERAGE) {
        const results: Promise<string>[] = [];
        for (const worker of this.workers) results.push(new Promise((r, e) => worker.process({request, resolve: r ,reject: e})));
        Promise.all(results).then(resolve as (r: string[]) => void).catch(reject);
        return;
      }
      const work: Work = {
        request,
        resolve,
        reject,
      };
      const worker = this.getAvailableWorker();
      if (worker) worker.process(work);
      else this.queue.push(work);
    });
  }

  private getAvailableWorker(): WorkerInstance | undefined {
    for (const w of this.workers) if (w.available) return w;
    if (this.workers.length < this.maxWorkers) {
      const num = this.workers.length + 1;
      Console.info('[WORKER] Launching worker', num);
      const w = new WorkerInstance(num, this.queue);
      this.workers.push(w);
      return w;
    }
    return undefined;
  }

}

class WorkerInstance {

  available = true;

  private readonly worker: Worker;
  private counter = 0;
  private readonly pending = new Map<number, {resolve: (value: any) => void, reject: (error?: any) => void}>();

  constructor(
    private readonly num: number,
    queue: Work[],
  ) {
    this.worker = new Worker(new URL('../heavy.worker', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      Console.debug('[WORKER-' + this.num + '] message received', data);
      const request = this.pending.get(data.id);
      if (!request) {
        Console.warn('[WORKER-' + this.num + '] Unexpected message received', data);
        return;
      }
      this.pending.delete(data.id);
      const next = queue.shift();
      if (next) this.process(next);
      else this.available = true;
      if (data.success) {
        request.resolve(data.payload);
      } else {
        request.reject(data.error);
      }
    };
  }

  public process(work: Work): void {
    this.available = false;
    const id = ++this.counter;
    const message: WorkerMessage = {
      request: work.request.request,
      id,
      payload: work.request.payload,
    };
    this.pending.set(id, {resolve: work.resolve, reject: work.reject});
    Console.debug('[WORKER-' + this.num + '] message sent', message);
    this.worker.postMessage(message);
  }

}

interface Work {
  request: Request;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

interface Request {
  request: WorkerRequest;
  payload: any;
  transferable: Transferable[];
}
