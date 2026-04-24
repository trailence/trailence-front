import { Injectable, Injector, NgZone } from '@angular/core';
import * as L from 'leaflet';
import { AuthService } from '../auth/auth.service';
import { MapLayer, MapLayersService } from './map-layers.service';
import { Progress, ProgressService } from '../progress/progress.service';
import { I18nService } from '../i18n/i18n.service';
import { Observable, bufferCount, catchError, combineLatest, firstValueFrom, forkJoin, map, merge, of, switchMap, tap, zip } from 'rxjs';
import { RequestLimiter } from 'src/app/utils/request-limiter';
import { BinaryContent } from 'src/app/utils/binary-content';
import { PreferencesService } from '../preferences/preferences.service';
import { TraceRecorderService } from '../trace-recorder/trace-recorder.service';
import { ErrorService } from '../progress/error.service';
import { I18nError, TranslatedString } from '../i18n/i18n-string';
import { Console } from 'src/app/utils/console';
import { GeoService, OverpassResponse, POI } from '../geolocation/geo.service';
import { Way, WayPermission } from '../geolocation/way';
import { OverpassClient } from '../geolocation/overpass-client.service';
import { Db } from '../database/storage/db';
import { BlobDto, DbTablesMetaBlob } from '../database/storage/db-tables-meta-blob';
import { DbTable, DbTableWhereLessThan } from '../database/storage/db-table';

interface TileMetadata {
  key: string;
  size: number;
  date: number;
}

interface OsmDataEntryDto {
  north: number;
  south: number;
  west: number;
  east: number;
  date: number;
  offline: boolean;
  elements: any[];
}

@Injectable({
  providedIn: 'root'
})
export class OfflineMapService {

  private readonly db: Db;
  private readonly tilesTables = new Map<string, DbTablesMetaBlob<TileMetadata>>();
  private readonly osmDataTables = new Map<string, DbTable<OsmDataEntryDto>>();
  private _cleanExpiredTimeout?: any;
  private _dbCounter = 0;

  constructor(
    auth: AuthService,
    private readonly layers: MapLayersService,
    private readonly preferencesService: PreferencesService,
    private readonly traceRecorder: TraceRecorderService,
    private readonly ngZone: NgZone,
    private readonly geoService: GeoService,
    private readonly injector: Injector,
    private readonly overpass: OverpassClient,
  ) {
    const tables: DbTable<any>[] = [];
    for (const layer of this.layers.possibleLayers) {
      const layerTables = new DbTablesMetaBlob<TileMetadata>(injector, layer, 'meta', 'tiles', 'key, date', 'key');
      this.tilesTables.set(layer, layerTables);
      tables.push(...layerTables.getTables());
    }
    for (const dataTable of ['osm_guidepost', 'osm_water', 'osm_toilets', 'osm_forbidden_ways', 'osm_permissive_ways']) {
      const table = new DbTable<OsmDataEntryDto>(injector, dataTable, '++id, north, south, west, east, date, offline', 'id');
      this.osmDataTables.set(dataTable, table);
      tables.push(table);
    }
    // TODO migrate to non-user-specific database
    this.db = new Db(injector, 'trailence_offline_map', true, tables);
    this.db.dbReady$.subscribe(ready => {
      this._dbCounter++;
      if (ready) this.cleanExpiredTimeout(ready.email);
      else {
        if (this._cleanExpiredTimeout) clearTimeout(this._cleanExpiredTimeout);
        this._cleanExpiredTimeout = undefined;
      }
    });
    this.db.start();
  }

  public getAdditions(bounds: L.LatLngBounds, guidepost: boolean, water: boolean, toilets: boolean, forbiddenWays: boolean, permissiveWays: boolean): Observable<{pois: POI[], ways: Way[]}> {
    const fromCache: Observable<{pois: POI[], ways: Way[]} | undefined>[] = [
      guidepost ? this.getOverpassElementsFromCache(bounds, 'osm_guidepost') : of(undefined),
      water ? this.getOverpassElementsFromCache(bounds, 'osm_water') : of(undefined),
      toilets ? this.getOverpassElementsFromCache(bounds, 'osm_toilets') : of(undefined),
      forbiddenWays ? this.getOverpassElementsFromCache(bounds, 'osm_forbidden_ways') : of(undefined),
      permissiveWays ? this.getOverpassElementsFromCache(bounds, 'osm_permissive_ways') : of(undefined),
    ];
    return forkJoin(fromCache).pipe(
      switchMap(cachedResult => {
        return this.getOverpassElementsFromOsm(
          bounds, false,
          guidepost && cachedResult[0] === undefined,
          water && cachedResult[1] === undefined,
          toilets && cachedResult[2] === undefined,
          forbiddenWays && cachedResult[3] === undefined,
          permissiveWays && cachedResult[4] === undefined,
        ).pipe(
          map(osmResult => {
            const result: {pois: POI[], ways: Way[]} = {pois: [], ways: []};
            for (const cached of cachedResult)
              if (cached) {
                result.pois.push(...cached.pois);
                result.ways.push(...cached.ways);
              }
            if (osmResult) {
              result.pois.push(...osmResult.pois);
              result.ways.push(...osmResult.ways);
            }
            return result;
          })
        );
      })
    );
  }

  private getOverpassElementsFromCache(bounds: L.LatLngBounds, tableName: string): Observable<{pois: POI[], ways: Way[]} | undefined> {
    const north = Math.floor(bounds.getNorth() * 1000000);
    const south = Math.floor(bounds.getSouth() * 1000000);
    const west = Math.floor(bounds.getWest() * 1000000);
    const east = Math.floor(bounds.getEast() * 1000000);
    return this.osmDataTables.get(tableName)!.getOneWhen(dto => north <= dto.north && south >= dto.south && west >= dto.west && east <= dto.east).pipe(
      map(item => {
        if (!item) return undefined;
        const result: {pois: POI[], ways: Way[]} = {pois: [], ways: []};
        for (const element of item.elements) {
          if (element.pos?.lat !== undefined && element.pos?.lng !== undefined) {
            if (bounds.contains(element.pos)) result.pois.push(element as POI);
          }
          if (element.bounds && element.points) {
            if (bounds.overlaps(L.latLngBounds({lat: element.bounds.maxlat, lng: element.bounds.minlon}, {lat: element.bounds.minlat, lng:element.bounds.maxlon}))) result.ways.push(element as Way);
          }
        }
        return result;
      })
    );
  }

  private storeOverpassElements(tableName: string, bounds: L.LatLngBounds, elements: any[], offline: boolean): void {
    const north = Math.floor(bounds.getNorth() * 1000000);
    const south = Math.floor(bounds.getSouth() * 1000000);
    const west = Math.floor(bounds.getWest() * 1000000);
    const east = Math.floor(bounds.getEast() * 1000000);
    const dto: OsmDataEntryDto = {
      north, south, west, east,
      elements,
      offline,
      date: Date.now(),
    };
    this.osmDataTables.get(tableName)!.setOne$(dto).subscribe();
  }

  private getOverpassElementsFromOsm(bounds: L.LatLngBounds, offline: boolean, guidepost: boolean, water: boolean, toilets: boolean, forbiddenWays: boolean, permissiveWays: boolean): Observable<{pois: POI[], ways: Way[]} | undefined> {
    if (!guidepost && !water && !toilets && !forbiddenWays && !permissiveWays) return of({pois: [], ways: []});
    const bbox = '(' + bounds.getSouth() + ',' + bounds.getWest() + ',' + bounds.getNorth() + ',' + bounds.getEast() + ')';
    let request = '\n(';
    if (guidepost)
      request += '\n node["tourism"="information"]["information"="guidepost"]' + bbox + ';';
    const amenity: string[] = [];
    if (water) amenity.push('drinking_water');
    if (toilets) amenity.push('toilets');
    if (amenity.length > 0)
      request += '\n node["amenity"~"' + amenity.map(a => '(' + a + ')').join('|') + '"]' + bbox + ';';
    const wayfoot: string[] = [];
    if (forbiddenWays) wayfoot.push('no','private','destination');
    if (permissiveWays) wayfoot.push('permissive');
    if (wayfoot.length > 0)
      request += '\n way["highway"]["foot"~"' + wayfoot.map(a => '(' + a + ')').join('|') + '"]' + bbox + ';';
    request += '\n);\nout meta geom;';
    return this.overpass.request<OverpassResponse>(request, 25)
    .pipe(
      map(response => response.elements ?? undefined),
      catchError(() => of(undefined)),
      map(elements => {
        if (!elements) return undefined;
        const pois: POI[] = [];
        const ways: Way[] = [];
        for (const element of elements) {
          if (element.type === 'way') {
            ways.push(this.geoService.overpassElementToWay(element));
          }
          if (element.type === 'node') {
            const poi = this.geoService.overpassElementToPOI(element);
            if (poi) pois.push(poi);
          }
        }
        if (guidepost) this.storeOverpassElements('osm_guidepost', bounds, pois.filter(p => p.type === 'guidepost'), offline);
        if (water) this.storeOverpassElements('osm_water', bounds, pois.filter(p => p.type === 'water'), offline);
        if (toilets) this.storeOverpassElements('osm_toilets', bounds, pois.filter(p => p.type === 'toilets'), offline);
        if (forbiddenWays) this.storeOverpassElements('osm_forbidden_ways', bounds, ways.filter(w => w.permission === WayPermission.FORBIDDEN), offline);
        if (permissiveWays) this.storeOverpassElements('osm_permissive_ways', bounds, ways.filter(w => w.permission === WayPermission.PERMISSIVE), offline);
        return {pois, ways};
      })
    );
  }


  public save(layer: MapLayer, crs: L.CRS, tileLayer: L.TileLayer, toDownload: Map<number, L.Point[]>): void {
    const table = this.tilesTables.get(layer.name);
    if (!table) return;
    new Saver(table, layer, crs, tileLayer, toDownload, this.injector).start();

  }

  public saveOsm(bounds: L.LatLngBounds[]): void {
    for (const b of bounds) {
      this.getOverpassElementsFromOsm(b, true, true, true, true, true, true);
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

  private cleanExpiredOsmData(dbCounter: number): void {
    if (dbCounter !== this._dbCounter) return;
    Console.info('Cleaning osm data cache');
    const tables = Array.from(this.osmDataTables.values());
    zip(
      tables.map(table =>
        table.keysWhere$(new DbTableWhereLessThan<OsmDataEntryDto>('date', Date.now() - this.preferencesService.preferences.offlineMapMaxKeepDays * 24 * 60 * 60 * 1000))
        .pipe(
          switchMap(keys =>
            table.deleteMany$(keys).pipe(
              switchMap(() => table.keysWhere$(new DbTableWhereLessThan<OsmDataEntryDto>('date', Date.now() - 3 * 60 * 60 * 1000, dto => !dto.offline))),
              switchMap(keys2 => table.deleteMany$(keys2).pipe(map(() => keys.length + keys2.length)))
            )
          ),
          tap(count => Console.info('Osm data removed from ' + table.name + ': ', count))
        )
      )
    ).subscribe();
  }

  private cleanExpiredTimeout(email: string | undefined) {
    if (!email) return; // TODO when migrated to non-user-specific
    const dbCounter = this._dbCounter;
    const lastClean = localStorage.getItem('trailence.map-offline.last-cleaning.' + email);
    const lastCleanTime = lastClean ? Number.parseInt(lastClean) : undefined;
    const nextClean = lastCleanTime && !Number.isNaN(lastCleanTime) ? lastCleanTime + 24 * 60 * 60 * 1000 : Date.now() + 60000;
    this._cleanExpiredTimeout = setTimeout(() => {
      if (dbCounter !== this._dbCounter) return;
      this._cleanExpiredTimeout = undefined;
      if (this.traceRecorder.recording) {
        this.cleanExpiredTimeout(email);
        return;
      }
      this.cleanExpired(dbCounter, email);
    }, Math.max(nextClean - Date.now(), 60000));
  }

  private cleanExpired(dbCounter: number, email: string): void {
    for (let i = 0; i < this.layers.layers.length; ++i) {
      const name = this.layers.layers[i].name;
      setTimeout(() => this.cleanExpiredLayer(dbCounter, name), 60000 + i * 15000);
    }
    this.cleanExpiredOsmData(dbCounter);
    setTimeout(() => {
      if (this._dbCounter === dbCounter) {
        localStorage.setItem('trailence.map-offline.last-cleaning.' + email, '' + Date.now());
        Console.info('All offline maps cleaned, next cleaning in 24 hours');
      }
    }, 60000 + this.layers.layers.length * 15000 + 30000);
  }

  private cleanExpiredLayer(dbCounter: number, layerName: string): void {
    if (dbCounter !== this._dbCounter) return;
    const table = this.tilesTables.get(layerName);
    if (!table) return;
    Console.info('Cleaning offline maps: ' + layerName);
    table.metadata.keysWhere$(new DbTableWhereLessThan('date', Date.now() - this.preferencesService.preferences.offlineMapMaxKeepDays * 24 * 60 * 60 * 1000))
    .pipe(
      switchMap(keys => {
        if (dbCounter !== this._dbCounter) return of(undefined);
        return table.deleteMany$(keys).pipe(tap(() => Console.info('Offline maps removed: ', layerName, keys.length)));
      })
    ).subscribe();
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
    this.progress = injector.get(ProgressService).create(new TranslatedString('offline_map.downloading.progress_title', [layer.displayName]).translate(this.i18n), 1, () => {
      this.cancelled = true;
      this.limiter.cancel();
      this.progress.done();
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
