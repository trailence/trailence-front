import { catchError, combineLatest, concat, firstValueFrom, from, map, Observable, of, switchMap } from 'rxjs';
import { DbTableWithBlob } from '../database/storage/db-table-with-blob';
import { Injector, NgZone } from '@angular/core';
import { HttpService } from '../http/http.service';
import { NetworkService } from '../network/network.service';
import { PendingRequests } from 'src/app/utils/pending-requests';
import { environment } from 'src/environments/environment';
import { Console } from 'src/app/utils/console';
import { ApiError } from '../http/api-error';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { DbTableWhereLessThan } from '../database/storage/db-table';
import { WorkerService } from 'src/app/worker/web-app';
import { POI, POIType } from './poi';
import { CleanupService } from '../database/cleanup/cleanup.service';

const CACHE_EXPIRATION = 90 * 24 * 60 * 60 * 1000;
const CACHE_NULL = -CACHE_EXPIRATION + 3 * 60 * 60 * 1000;

export class Pois {

  readonly table: DbTableWithBlob<DbDto>;
  private readonly http: HttpService;
  private readonly network: NetworkService;
  private readonly worker: WorkerService;
  private readonly pendingRequests = new PendingRequests<Blob | null | undefined>();

  constructor(
    injector: Injector,
  ) {
    this.table = new DbTableWithBlob<DbDto>(injector, 'osm-data-pois', 'tile, lastUsed, version', 'tile', 'blob');
    this.http = injector.get(HttpService);
    this.network = injector.get(NetworkService);
    this.worker = injector.get(WorkerService);
    injector.get(NgZone).runOutsideAngular(() => setTimeout(() => {
      if (this._destroyed) return;
      injector.get(CleanupService).add({
        id: 'pois',
        name: 'POIs cache',
        every: 24 * 60 * 60 * 1000,
        execute: () => this.clean(),
      });
    }, 1000));
  }

  private _destroyed = false;
  stop(): void {
    this._destroyed = true;
  }

  public getPois(bounds: L.LatLngBounds, types: POIType[]): Observable<PoisResponse> {
    const tiles = this.toTiles(bounds, types);
    if (tiles.length === 0) return of({pois: [], done: true, partial: false, osmDataVersion: undefined});
    return combineLatest(tiles.map(t => concat(
      of({pois: [], done: false, partial: false, osmDataVersion: undefined} as PoisResponse),
      this.getTile(t.tile).pipe(
        switchMap(tile => {
          console.log('tile', tile)
          if (tile === undefined) return of({pois: [], done: true, partial: true, osmDataVersion: undefined} as PoisResponse);
          if (tile.blob === null) return of({pois: [], done: true, partial: false, osmDataVersion: tile.version} as PoisResponse);
          return this.worker.parsePois(tile.blob, t.type, bounds).then(pois => ({pois, done: true, partial: false, osmDataVersion: tile.version}));
        })
      )
    ))).pipe(
      debounceTimeExtended(250, 250, undefined, (p, n) => n.every(r => r.done)),
      map(responses => ({
        pois: responses.flatMap(r => r.pois),
        done: responses.every(r => r.done),
        partial: !responses.every(r => !r.partial),
        osmDataVersion: responses.map(r => r.osmDataVersion as number | undefined | null).reduce((p,n) => p === undefined ? n : (p === n ? n : null), undefined) ?? undefined,
      }))
    );
  }

  /** return the blob, or null if no blob exists, or undefined if not in cache and no network */
  private getTile(tile: string): Observable<{blob: Blob | null, version: number} | undefined> {
    return this.table.getByKey$(tile).pipe(
      switchMap(dto => {
        const server = this.network.server;
        if (!dto) {
          if (!server) return of(undefined);
          return this.requestAndCacheV1(tile, server.osmDataVersions[1]).pipe(map(blob => (blob === undefined ? undefined : {blob, version: server.osmDataVersions[1]})));
        }
        if (server && dto.version < server.osmDataVersions[1])
          return this.requestAndCacheV1(tile, server.osmDataVersions[1]).pipe(map(blob => (blob === undefined ? undefined : {blob: blob || this.used(dto).blob, version: server.osmDataVersions[1]})));
        return of({blob: this.used(dto).blob, version: dto.version});
      }),
      catchError(e => {
        Console.warn('Error getting poi tile', tile, e);
        return of(undefined);
      })
    );
  }

  private used(dto: DbDto): DbDto {
    if (dto.blob === null) return dto;
    const now = Date.now();
    if (now - dto.lastUsed < 120000) return dto;
    dto.lastUsed = now;
    this.table.setOne$(dto).subscribe();
    return dto;
  }

  private requestAndCacheV1(tile: string, version: number): Observable<Blob | null | undefined> {
    return from(this.pendingRequests.request(tile, () =>
      firstValueFrom(this.http.getBlob(environment.apiBaseUrl + '/geo-data/v1/' + tile).pipe(
        map(blob => {
          this.table.setOne$({
            tile,
            version,
            lastUsed: Date.now(),
            blob,
          }).subscribe();
          return blob;
        }),
        catchError(e => {
          if (e instanceof ApiError && e.httpCode === 404){
            this.table.setOne$({
              tile,
              version,
              lastUsed: Date.now() + CACHE_NULL,
              blob: null,
            }).subscribe();
            return of(null);
          }
          Console.error('Error getting tile', tile, e);
          return of(undefined);
        })
      ))
    ));
  }

  private boundsToTiles(bounds: L.LatLngBounds): number[] {
    const minX = Math.floor((bounds.getWest() + 180) / 2);
    const maxX = Math.floor((bounds.getEast() + 180) / 2);
    const minY = Math.floor((bounds.getNorth() + 90) / 2);
    const maxY = Math.floor((bounds.getNorth() + 90) / 2);
    const tiles: number[] = [];
    for (let x = minX; x <= maxX; ++x) {
      for (let y = minY; y <= maxY; ++y) {
        tiles.push(y * 180 + x);
      }
    }
    return tiles;
  }

  private typeToTile(type: POIType): string {
    switch(type) {
      case 'guidepost': return 'guidepost';
      case 'water': return 'drinking_water';
      case 'toilets': return 'toilets';
    }
  }

  private toTiles(bounds: L.LatLngBounds, types: POIType[]): {tile: string, type: POIType}[] {
    const boundsTiles = this.boundsToTiles(bounds);
    const typesTiles = types.map(t => ({tileType: this.typeToTile(t), poiType: t}));
    const tiles: {tile: string, type: POIType}[] = [];
    for (const type of typesTiles) {
      for (const b of boundsTiles) {
        tiles.push({tile: type.tileType + '/' + b, type: type.poiType});
      }
    }
    return tiles;
  }

  private clean(): Promise<string> {
    return firstValueFrom(this.table.deleteWhere$(new DbTableWhereLessThan('lastUsed', Date.now() - CACHE_EXPIRATION))).then(nb => '' + nb);
  }
}

export interface PoisResponse {
  pois: POI[];
  done: boolean;
  partial: boolean;
  osmDataVersion: number | undefined;
}

interface DbDto {
  tile: string;
  version: number;
  lastUsed: number;
  blob: Blob | null;
}
