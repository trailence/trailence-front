import { Injectable, NgZone } from '@angular/core';
import * as L from 'leaflet';
import { AuthService } from '../auth/auth.service';
import Dexie from 'dexie';
import { MapLayer, MapLayersService } from './map-layers.service';
import { Progress, ProgressService } from '../progress/progress.service';
import { I18nService } from '../i18n/i18n.service';
import { Observable, combineLatest, from, map, of, zip } from 'rxjs';
import { RequestLimiter } from 'src/app/utils/request-limiter';
import { HttpService } from '../http/http.service';
import { BinaryContent } from 'src/app/utils/binary-content';
import { PreferencesService } from '../preferences/preferences.service';
import { TraceRecorderService } from '../trace-recorder/trace-recorder.service';
import { HttpClient } from '@angular/common/http';
import { ErrorService } from '../progress/error.service';
import { I18nError } from '../i18n/i18n-string';
import { Console } from 'src/app/utils/console';

interface TileMetadata {
  key: string;
  size: number;
  date: number;
}

interface TileBlob {
  key: string;
  blob: Blob;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineMapService {

  private _db?: Dexie;
  private _openEmail?: string;
  private _cleanExpiredTimeout?: any;

  constructor(
    auth: AuthService,
    private layers: MapLayersService,
    private progressService: ProgressService,
    private i18n: I18nService,
    private http: HttpService,
    private preferencesService: PreferencesService,
    private traceRecorder: TraceRecorderService,
    private angularHttp: HttpClient,
    private errorService: ErrorService,
    private ngZone: NgZone,
  ) {
    auth.auth$.subscribe(
      auth => {
        if (!auth) this.close();
        else this.open(auth.email);
      }
    );
  }

  private close() {
    if (this._db) {
      this._db.close();
      this._openEmail = undefined;
      this._db = undefined;
      if (this._cleanExpiredTimeout) clearTimeout(this._cleanExpiredTimeout);
      this._cleanExpiredTimeout = undefined;
    }
  }

  private open(email: string): void {
    if (this._openEmail === email) return;
    this.close();
    this._openEmail = email;
    const db = new Dexie('trailence_offline_map_' + email);
    const storesV1: any = {};
    for (const layer of this.layers.possibleLayers) {
      storesV1[layer + '_meta'] = 'key, date';
      storesV1[layer + '_tiles'] = 'key';
    }
    db.version(1).stores(storesV1);
    this._db = db;
    this.cleanExpiredTimeout();
  }

  public save(bounds: L.LatLngBounds[], tiles: L.TileLayer, crs: L.CRS, layer: MapLayer): void {
    const state = new SaveState(bounds, tiles, crs);
    let limiter: RequestLimiter | undefined;
    const progress = this.progressService.create(this.i18n.texts.downloading_map, 1, () => {
      state.cancelled = true;
      if (limiter) {
        limiter.cancel();
        progress.done();
      }
    });
    progress.subTitle = this.i18n.texts.preparing_download;
    this.computeTilesCoords$(state, progress)
    .then(() => {
      if (state.cancelled) return;
      if (state.coords.length === 0) {
        progress.done();
        return;
      }
      progress.workDone = 0;
      progress.workAmount = state.coords.length;
      progress.subTitle = layer.displayName;
      const db = this._db!;
      const metaTable = db.table<TileMetadata>(layer.name + '_meta');
      const tilesTables = db.table<TileBlob>(layer.name + '_tiles');
      const existing$: Observable<TileMetadata | undefined>[] = [];
      for (const c of state.coords) {
        const key = '' + c.z + '_' + c.y + '_' + c.x;
        existing$.push(this.ngZone.runOutsideAngular(() => from(metaTable.get(key))));
      }
      const maxTime = Date.now() - this.preferencesService.preferences.offlineMapMaxKeepDays * 24 * 60 * 60 * 1000;
      combineLatest(existing$).subscribe(
        result => {
          const coordsToDl = [];
          for (let i = 0; i < state.coords.length; ++i) {
            const known = result[i];
            if (known && known.date > maxTime) continue;
            coordsToDl.push(state.coords[i]);
          }
          if (coordsToDl.length === 0 || state.cancelled) {
            progress.done();
            return;
          }
          progress.subTitle = layer.displayName + ' 0/' + coordsToDl.length;
          progress.workAmount = coordsToDl.length;
          limiter = new RequestLimiter(layer.maxConcurrentRequests);
          let done = 0;
          let errors = 0;
          const ondone = () => {
            progress.done();
            if (errors > 0) this.errorService.addError(new I18nError('errors.download_offline_map', [errors]))
          };
          for (const c of coordsToDl) {
            const request$ = limiter.add(() => this.getBlob(layer, layer.getTileUrl(tiles, c, crs)));
            request$.subscribe({
              next: blob => {
                zip([
                  from(metaTable.put({
                    key: '' + c.z + '_' + c.y + '_' + c.x,
                    size: blob.size,
                    date: Date.now()
                  })),
                  from(tilesTables.put({
                    key: '' + c.z + '_' + c.y + '_' + c.x,
                    blob: blob
                  }))
                ]).subscribe(() => {
                  progress.workDone = ++done;
                  progress.subTitle = layer.displayName + ' ' + done + '/' + coordsToDl.length;
                  if (done === coordsToDl.length) ondone();
                });
              },
              error: e => {
                Console.error('Error loading map tile', e);
                errors++;
                progress.workDone = ++done;
                progress.subTitle = layer.displayName + ' ' + done + '/' + coordsToDl.length;
                if (done === coordsToDl.length) ondone();
              }
            });
          }
        }
      );
    });
  }

  private getBlob(layer: MapLayer, url: string): Observable<Blob> {
    if (layer.doNotUseNativeHttp) {
      return this.angularHttp.get(url, {responseType: 'blob'});
    }
    return this.http.getBlob(url);
  }

  private computeTilesCoords$(state: SaveState, progress: Progress): Promise<boolean> {
    const maxZoom = Math.min(state.layer.options.maxZoom!, this.preferencesService.preferences.offlineMapMaxZoom);
    return new Promise<boolean>(resolve => {
      for (const bounds of state.boundsList) {
        for (let zoom = 1; zoom <= maxZoom; zoom++) {
          const area = L.bounds(
            state.crs.latLngToPoint(bounds.getNorthWest(), zoom),
            state.crs.latLngToPoint(bounds.getSouthEast(), zoom)
          );
          if (!area.min || !area.max) continue;
          const topLeftTile = area.min.divideBy(state.layer.getTileSize().x).floor();
          const bottomRightTile = area.max.divideBy(state.layer.getTileSize().x).floor();
          progress.addWorkToDo(bottomRightTile.y - topLeftTile.y + 1);
        }
      }
      const computeNext = () => {
        if (state.cancelled) return;
        if (state.boundsIndex >= state.boundsList.length) {
          resolve(true);
          return;
        }
        const bounds = state.boundsList[state.boundsIndex];
        const area = L.bounds(
          state.crs.latLngToPoint(bounds.getNorthWest(), state.zoom),
          state.crs.latLngToPoint(bounds.getSouthEast(), state.zoom)
        );
        this.getTilesPoints$(area, state.layer.getTileSize(), progress)
        .then(points => {
          for (const point of points) {
            const exists = state.coords.find(e => e.x === point.x && e.y === point.y && e.z === state.zoom);
            if (!exists) {
              (point as any)['z'] = state.zoom;
              state.coords.push(point as L.Coords);
            }
          }
          if (state.zoom === maxZoom) {
            state.boundsIndex++;
            state.zoom = 1;
          } else {
            state.zoom++;
          }
          this.ngZone.runTask(() => setTimeout(() => computeNext(), 0));
        });
      };
      this.ngZone.runTask(() => computeNext());
    });
  }

  private getTilesPoints$(area: L.Bounds, tileSize: L.Point, progress: Progress): Promise<L.Point[]> {
    const points: L.Point[] = [];
    if (!area.min || !area.max) {
      return Promise.resolve(points);
    }
    const topLeftTile = area.min.divideBy(tileSize.x).floor();
    const bottomRightTile = area.max.divideBy(tileSize.x).floor();

    return new Promise<L.Point[]>(resolve => {
      const computeNextRow = (j: number) => {
        for (let i = topLeftTile.x; i <= bottomRightTile.x; i += 1) {
          points.push(new L.Point(i, j));
        }
        progress.addWorkDone(1);
        if (j == bottomRightTile.y) {
          resolve(points);
          return;
        }
        this.ngZone.runTask(() => setTimeout(() => computeNextRow(j + 1), 0));
      };
      this.ngZone.runTask(() => computeNextRow(topLeftTile.y));
    });
  }

  public getTile(layerName: string, coords: L.Coords): Observable<BinaryContent | undefined> {
    return this.ngZone.runOutsideAngular(() => {
      if (!this._db) return of(undefined);
      return from(this._db.table<TileBlob>(layerName + '_tiles').get('' + coords.z + '_' + coords.y + '_' + coords.x)).pipe(
        map(result => {
          const blob = result?.blob;
          if (!blob) return undefined;
          return new BinaryContent(blob);
        })
      );
    });
  }

  public computeContent(): Observable<{items: number, size: number}> {
    return combineLatest(this.layers.layers.map(layer => this.computeLayerContent(layer.name))).pipe(
      map(list => {
        const result = {items: 0, size: 0};
        for (const layer of list) {
          result.items += layer.items;
          result.size += layer.size;
        }
        return result;
      })
    );
  }

  private computeLayerContent(name: string): Observable<{items: number, size: number}> {
    const result = {items: 0, size: 0};
    if (!this._db) return of(result);
    return from(this._db.table<TileMetadata>(name + '_meta').each((item => {
      result.items++;
      result.size += item.size;
    }))).pipe(
      map(() => result)
    );
  }

  private cleanExpiredTimeout() {
    const db = this._db!;
    const lastClean = localStorage.getItem('trailence.map-offline.last-cleaning.' + this._openEmail);
    const lastCleanTime = lastClean ? parseInt(lastClean) : undefined;
    const nextClean = lastCleanTime && !isNaN(lastCleanTime) ? lastCleanTime + 24 * 60 * 60 * 1000 : Date.now() + 60000;
    this._cleanExpiredTimeout = setTimeout(() => {
      if (db !== this._db) return;
      this._cleanExpiredTimeout = undefined;
      if (this.traceRecorder.recording) {
        this.cleanExpiredTimeout();
        return;
      }
      this.cleanExpired(db);
    }, Math.max(nextClean - Date.now(), 60000));
  }

  private cleanExpired(db: Dexie): void {
    for (let i = 0; i < this.layers.layers.length; ++i) {
      const name = this.layers.layers[i].name;
      setTimeout(() => this.cleanExpiredLayer(db, name), 60000 + i * 15000);
    }
    setTimeout(() => {
      if (this._db === db) {
        localStorage.setItem('trailence.map-offline.last-cleaning.' + this._openEmail, '' + Date.now());
        Console.info('All offline maps cleaned, next cleaning in 24 hours');
      }
    }, 60000 + this.layers.layers.length * 15000 + 30000);
  }

  private cleanExpiredLayer(db: Dexie, layerName: string): void {
    if (db !== this._db) return;
    let count = 0;
    Console.info('Cleaning offline maps: ' + layerName);
    db.transaction('rw', [layerName + '_meta', layerName + '_tiles'], () => {
      db.table<TileMetadata, string>(layerName + '_meta')
      .where('date')
      .below(Date.now() - this.preferencesService.preferences.offlineMapMaxKeepDays * 24 * 60 * 60 * 1000)
      .eachPrimaryKey(key => {
        this.cleanExpiredTile(db, layerName, key);
        count++;
      }).then(() => {
        Console.info('Offline maps removed: ', layerName, count);
      });
    });
  }

  private cleanExpiredTile(db: Dexie, layerName: string, key: string): void {
    if (db !== this._db) return;
    db.table<TileMetadata, string>(layerName + '_meta').delete(key);
    db.table<TileBlob, string>(layerName + '_tiles').delete(key);
  }

  public removeAll(): Observable<any> {
    const promises = [];
    for (const layer of this.layers.layers) {
      promises.push(from(this._db!.table(layer.name + '_meta').clear()));
      promises.push(from(this._db!.table(layer.name + '_tiles').clear()));
    }
    if (promises.length === 0) return of(null);
    return zip(promises);
  }

}

class SaveState {
  constructor(
    public boundsList: L.LatLngBounds[],
    public layer: L.TileLayer,
    public crs: L.CRS,
    public boundsIndex = 0,
    public zoom = 1,
    public cancelled = false,
    public coords: L.Coords[] = [],
  ) {}
}
