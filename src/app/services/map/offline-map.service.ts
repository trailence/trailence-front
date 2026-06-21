import { Injectable, Injector, NgZone } from '@angular/core';
import * as L from 'leaflet';
import { MapLayer, MapLayersService } from './map-layers.service';
import { Progress, ProgressService } from '../progress/progress.service';
import { I18nService } from '../i18n/i18n.service';
import { Observable, bufferCount, catchError, combineLatest, firstValueFrom, map, merge, of, switchMap, tap, zip } from 'rxjs';
import { RequestLimiter } from 'src/app/utils/request-limiter';
import { BinaryContent } from 'src/app/utils/binary-content';
import { PreferencesService } from '../preferences/preferences.service';
import { ErrorService } from '../progress/error.service';
import { I18nError, TranslatedString } from '../i18n/i18n-string';
import { Console } from 'src/app/utils/console';
import { Db } from '../database/storage/db';
import { BlobDto, DbTablesMetaBlob } from '../database/storage/db-tables-meta-blob';
import { DbTable, DbTableWhereLessThan } from '../database/storage/db-table';
import { Pois } from './pois';
import { AssetsService } from '../assets/assets.service';
import { Ways } from './ways';
import { POI_TYPES, POIType } from './poi';
import { CleanupService } from '../database/cleanup/cleanup.service';

interface TileMetadata {
  key: string;
  size: number;
  date: number;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineMapService {

  private readonly db: Db;
  private readonly tilesTables = new Map<string, DbTablesMetaBlob<TileMetadata>>();

  readonly pois: Pois;
  readonly ways: Ways;

  constructor(
    private readonly layers: MapLayersService,
    private readonly preferencesService: PreferencesService,
    private readonly ngZone: NgZone,
    private readonly injector: Injector,
  ) {
    const tables: DbTable<any>[] = [];
    for (const layer of this.layers.possibleLayers) {
      const layerTables = new DbTablesMetaBlob<TileMetadata>(injector, layer, 'meta', 'tiles', 'key, date', 'key');
      this.tilesTables.set(layer, layerTables);
      tables.push(...layerTables.getTables());
    }
    this.pois = new Pois(injector);
    tables.push(this.pois.table);
    this.ways = new Ways(injector);
    tables.push(this.ways.table);
    this.db = new Db(injector, 'trailence_offline_map', false, tables);
    this.db.onClosed$.subscribe(closed => this.unregisterCleaning())
    this.db.dbReady$.subscribe(ready => {
      if (ready) this.registerCleaning();
    });
    this.db.addHookBeforeCreatingDb(() => import('../database/storage/migrate-db-from-user-to-global').then(module => module.migrateLatestUserDbToGlobalDb('trailence_offline_map', injector)));
    this.db.start();
  }

  public getPoiIcon$(type: POIType) {
    return this.injector.get(AssetsService).getIcon('poi-' + type, true);
  }

  public save(layer: MapLayer, crs: L.CRS, tileLayer: L.TileLayer, toDownload: Map<number, L.Point[]>): void {
    const table = this.tilesTables.get(layer.name);
    if (!table) return;
    new Saver(table, layer, crs, tileLayer, toDownload, this.injector).start();

  }

  public saveOsm(bounds: L.LatLngBounds[]): void {
    for (const b of bounds) {
      // TODO progress
      this.pois.getPois(b, POI_TYPES).subscribe();
      this.ways.getWays(b, true).subscribe();
    }
  }

  public getTilesToDownload(tiles: L.Point[], zoomLevel: number, layerName: string): Promise<L.Point[]> {
    const table = this.tilesTables.get(layerName);
    if (!table) return Promise.resolve([]);
    const maxCacheValidDate = Date.now() - this.injector.get(PreferencesService).preferences.offlineMapMaxKeepDays * 24 * 60 * 60 * 1000;
    const toSearch = tiles.map(tile => '' + zoomLevel + '_' + tile.y + '_' + tile.x);
    return firstValueFrom(table.metadata.getByKeys$(toSearch))
    .then(metas => {
      const byKey = new Map<string, TileMetadata>(metas.map(m => [m.key, m]));
      const result: L.Point[] = [];
      for (const tile of tiles) {
        const key = '' + zoomLevel + '_' + tile.y + '_' + tile.x;
        const meta = byKey.get(key);
        if (!meta || meta.date <= maxCacheValidDate) result.push(tile);
      }
      return result;
    })
  }

  public getTile(layerName: string, coords: L.Coords): Observable<BinaryContent | undefined> {
    return this.ngZone.runOutsideAngular(() => {
      const table = this.tilesTables.get(layerName);
      if (!table) return of(undefined);
      const contentType = this.layers.layers.find(l => l.name === layerName)?.tileMimeFormat;
      return table.getBlob$('' + coords.z + '_' + coords.y + '_' + coords.x, contentType).pipe(map(b => b ? new BinaryContent(b) : undefined));
    });
  }

  public computeContent(): Observable<{items: number, size: number}> {
    const startTime = Date.now();
    return combineLatest(this.layers.layers.map(layer => this.computeLayerContent(layer.name))).pipe(
      map(list => {
        const result = {items: 0, size: 0};
        for (const layer of list) {
          result.items += layer.items;
          result.size += layer.size;
        }
        Console.info('Offline map counters computed in ' + (Date.now() - startTime) + 'ms.', result);
        return result;
      })
    );
  }

  private computeLayerContent(name: string): Observable<{items: number, size: number}> {
    const result = {items: 0, size: 0};
    const table = this.tilesTables.get(name);
    if (!table) return of(result);
    return table.metadata.count$().pipe(
      switchMap(count => {
        result.items = count;
        if (count === 0) return of(result);
        const next = (i: number): Observable<boolean> => {
          const next$ = table.metadata.getPage$(i, i + 50000 > count ? count - i : 50000).pipe(
            map(items => {
              for (const item of items) result.size += item.size;
              return true;
            })
          )
          return i + 50000 > count ? next$ : next$.pipe(switchMap(() => next(i + 50000)));
        };
        return next(0);
      }),
      map(() => result),
    );
  }

  private unregisterCleaning(): void {
    const service = this.injector.get(CleanupService);
    for (const layer of this.layers.layers) {
      service.remove('offline-map-' + layer.name);
    }
  }

  private registerCleaning(): void {
    const service = this.injector.get(CleanupService);
    for (const layer of this.layers.layers) {
      service.add({
        id: 'offline-map-' + layer.name,
        name: 'Offline map ' + layer.displayName,
        every: 24 * 60 * 60 * 1000,
        execute: () => this.cleanExpiredLayer(layer.name)
      });
    }
  }

  private cleanExpiredLayer(layerName: string): Promise<string> {
    const table = this.tilesTables.get(layerName);
    if (!table) return Promise.resolve('table not found');
    return firstValueFrom(
      table.metadata.keysWhere$(new DbTableWhereLessThan('date', Date.now() - this.preferencesService.preferences.offlineMapMaxKeepDays * 24 * 60 * 60 * 1000))
      .pipe(
        switchMap(keys => table.deleteMany$(keys).pipe(map(() => '' + keys.length)))
      )
    );
  }

  public removeAll(): Observable<any> {
    const deletes$ = Array.from(this.tilesTables.values())
      .map(table => table.deleteAll$());
    if (deletes$.length === 0) return of(null);
    return zip(deletes$);
  }

}

class Saver {

  constructor(
    private readonly table: DbTablesMetaBlob<TileMetadata>,
    private readonly layer: MapLayer,
    private readonly crs: L.CRS,
    private readonly tileLayer: L.TileLayer,
    private readonly toDownload: Map<number, L.Point[]>,
    private readonly injector: Injector,
  ) {
    this.limiter = new RequestLimiter(layer.maxConcurrentRequests);
    this.i18n = injector.get(I18nService);
    this.mapLayerService = injector.get(MapLayersService);
    this.progress = injector.get(ProgressService).create(new TranslatedString('offline_map.downloading.progress_title', [layer.displayName]).translate(this.i18n), 1, async () => {
      this.cancelled = true;
      this.limiter.cancel();
    });
    this.zooms = Array.from(toDownload.keys()).sort((a, b) => a - b);
    this.currentZoom = 0;
  }

  private readonly zooms: number[];

  public start(): void {
    setTimeout(() => {
      this.process(0)
      .then(() => {
        // TODO retry errors
        this.progress.done();
        let nbErrors = 0;
        for (const [_, tiles] of this.errorsByZoom) {
          nbErrors += tiles.length;
        }
        if (nbErrors > 0) this.injector.get(ErrorService).addError(new I18nError('errors.download_offline_map', [nbErrors]));
      })
    }, 0);
  }

  private readonly limiter: RequestLimiter;
  private readonly progress: Progress;
  private readonly i18n: I18nService;
  private readonly mapLayerService: MapLayersService;

  private cancelled = false;
  private currentZoom: number;
  private readonly errorsByZoom = new Map<number, L.Point[]>();

  private process(zoomIndex: number): Promise<any> {
    this.currentZoom = zoomIndex;
    const zoomLevel = this.zooms[zoomIndex];
    return this.downloadTiles(zoomLevel, this.toDownload.get(zoomLevel)!)
    .then(() => {
      if (this.currentZoom === this.zooms.length - 1 || this.cancelled) return;
      return this.process(this.currentZoom + 1);
    })
  }

  private getDbKey(x: number, y: number, z: number): string {
    return '' + z + '_' + y + '_' + x;
  }

  private downloadTiles(zoomLevel: number, tiles: L.Point[]): Promise<any> {
    this.progress.workDone = 0;
    this.progress.workAmount = tiles.length + 1;
    this.progress.subTitle = 'Zoom ' + zoomLevel + ': 0/' + tiles.length;
    let done = 0;
    const processNext1000 = (startIndex: number) => new Promise(resolve => {
      const requests: Observable<{blob: Blob | undefined, key: string, tile: L.Point, error: any}>[] = [];
      for (let i = startIndex; i < startIndex + 1000 && i < tiles.length; ++i) {
        const c = tiles[i];
        (c as any)['z'] = zoomLevel;
        const key = this.getDbKey(c.x, c.y, zoomLevel);
        requests.push(this.limiter.add(() =>
          this.mapLayerService.getBlob(this.layer, this.layer.getTileUrl(this.tileLayer, c as L.Coords, this.crs))
          .pipe(
            map(blob => ({blob, key, tile: c, error: undefined})),
            catchError(e => of({blob: undefined, key, tile: c, error: e})),
          )
        ));
      }
      merge(...requests).pipe(
        bufferCount(50),
        switchMap(bunch => {
          const metadata: TileMetadata[] = [];
          const tiles: BlobDto[] = [];
          for (const response of bunch) {
            if (response.error === undefined) {
              metadata.push({
                key: response.key,
                size: response.blob!.size,
                date: Date.now(),
              });
              tiles.push({
                key: response.key,
                blob: response.blob!,
              });
            } else {
              Console.error('Error loading map tile', response.error);
              const errors = this.errorsByZoom.get(zoomLevel);
              if (errors) errors.push(response.tile);
              else this.errorsByZoom.set(zoomLevel, [response.tile]);
            }
          }
          return metadata.length === 0 ? of(bunch.length) : this.table.setMany$(metadata, tiles).pipe(
            map(() => bunch.length),
            catchError(e => {
              Console.error('Error storing map tiles', e);
              const errors = this.errorsByZoom.get(zoomLevel);
              if (errors) errors.push(...bunch.map(r => r.tile));
              else this.errorsByZoom.set(zoomLevel, bunch.map(r => r.tile));
              return of(bunch.length);
            })
          );
        }),
        tap(bunch => {
          done += bunch;
          this.progress.subTitle = 'Zoom ' + zoomLevel + ': ' + done + '/' + tiles.length;
          this.progress.addWorkDone(bunch);
        })
      ).subscribe({
        complete: () => {
          if (this.cancelled) {
            resolve(false);
            return;
          }
          if (startIndex + 1000 >= tiles.length) {
            resolve(true);
          } else {
            processNext1000(startIndex + 1000).then(resolve);
          }
        }
      });
    });
    return processNext1000(0);
  }

}
