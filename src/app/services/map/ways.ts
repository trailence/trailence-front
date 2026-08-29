import { WorkerService } from 'src/app/worker/web-app';
import { DbTableWithBlob } from '../database/storage/db-table-with-blob';
import { HttpService } from '../http/http.service';
import { NetworkService } from '../network/network.service';
import { PendingRequests } from 'src/app/utils/pending-requests';
import { Injector, NgZone } from '@angular/core';
import { catchError, debounceTime, filter, first, firstValueFrom, forkJoin, from, map, Observable, of, Subscriber, switchMap, tap } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiError } from '../http/api-error';
import { Console } from 'src/app/utils/console';
import { Way } from './way';
import { DbTableWhereLessThan } from '../database/storage/db-table';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { CleanupService } from '../database/cleanup/cleanup.service';

const CACHE_EXPIRATION = 90 * 24 * 60 * 60 * 1000;
const CACHE_NULL = -CACHE_EXPIRATION + 3 * 60 * 60 * 1000;

export interface WaysResponse {
  ways: Way[];
  done: boolean;
  partial: boolean;
  osmDataVersion: number | undefined,
}

export interface AllWaysResponse {
  ways: Way[],
  partial: boolean,
  osmDataVersion: number | undefined,
}

export class Ways {

  readonly table: DbTableWithBlob<DbDto>;
  private readonly http: HttpService;
  private readonly network: NetworkService;
  private readonly worker: WorkerService;
  private readonly pendingRequests = new PendingRequests<Blob | null | undefined>();

  constructor(
    injector: Injector,
  ) {
    this.table = new DbTableWithBlob<DbDto>(injector, 'osm-data-ways', 'tile, lastUsed, version', 'tile', 'blob');
    this.http = injector.get(HttpService);
    this.network = injector.get(NetworkService);
    this.worker = injector.get(WorkerService);
    injector.get(NgZone).runOutsideAngular(() => setTimeout(() => {
      if (this._destroyed) return;
      injector.get(CleanupService).add({
        id: 'ways',
        name: 'ways cache',
        every: 24 * 60 * 60 * 1000,
        execute: () => this.clean(),
      });
    }, 1000));
  }

  private _destroyed = false;
  stop(): void {
    this._destroyed = true;
  }

  public getWays(bounds: L.LatLngBounds, retryOnPartial: boolean): Observable<WaysResponse> {
    const boundsTiles = this.boundsToTiles(bounds);
    if (boundsTiles.length === 0) return of({ways: [], done: true, partial: false, osmDataVersion: undefined});
    return new Observable<WaysResponse>(subscriber => {
      this.processWaysTiles([], boundsTiles, bounds, false, subscriber, retryOnPartial, 0);
    });
  }

  public getAllWays(bounds: L.LatLngBounds, retryOnPartial: boolean): Observable<AllWaysResponse> {
    let allWays: Way[] = [];
    let version: number | undefined | null = undefined;
    return this.getWays(bounds, retryOnPartial).pipe(
      tap(response => {
        allWays.push(...response.ways);
        if (version === undefined) version = response.osmDataVersion;
        else if (response.osmDataVersion && response.osmDataVersion !== version) version = null;
      }),
      filter(response => response.done),
      map(response => {
        const result = allWays;
        allWays = [];
        return {ways: result, partial: response.partial, osmDataVersion: version ?? undefined};
      }),
    );
  }

  private processWaysTiles(tilesProcessed: number[], tilesToProcess: number[], bounds: L.LatLngBounds, partial: boolean, subscriber: Subscriber<WaysResponse>, retryOnPartial: boolean, retry: number) {
    forkJoin(tilesToProcess.map(tileNumber =>
      this.getTile('' + tileNumber).pipe(
        switchMap(tile => {
          if (tile === undefined) return of(undefined);
          if (tile.blob === null) return of(null);
          return this.worker.parseWays(tile.blob, bounds).then(response => ({response, version: tile.version}));
        }),
        tap(response => {
          if (response) subscriber.next({ways: response.response.ways, done: false, partial: false, osmDataVersion: response.version});
        })
      )
    )).subscribe(responses => { // NOSONAR
      const newProcessed = [...tilesProcessed, ...tilesToProcess];
      const newToProcess: number[] = [];
      for (const response of responses) {
        if (response) {
          for (const reference of response.response.references) {
            if (!newProcessed.includes(reference.tile) && !newToProcess.includes(reference.tile))
              newToProcess.push(reference.tile);
          }
        } else if (response === undefined) {
          partial = true;
        }
      }
      if (newToProcess.length === 0 || tilesProcessed.length > 0) { // only one level of references
        subscriber.next({ways: [], done: true, partial, osmDataVersion: undefined});
        if (!partial || !retryOnPartial) {
          subscriber.complete();
        } else {
          this.network.server$.pipe(debounceTime(retry * 10000 + 2500), filterDefined(), first()).subscribe(() => this.processWaysTiles([], newProcessed, bounds, false, subscriber, true, retry + 1));
        }
      } else {
        this.processWaysTiles(newProcessed, newToProcess, bounds, partial, subscriber, retryOnPartial, retry);
      }
    });
  }

  /** return the blob, or null if no blob exists, or undefined if not in cache and no network */
  private getTile(tile: string): Observable<{blob: Blob | null, version: number} | undefined> {
    return this.table.getByKey$(tile).pipe(
      switchMap(dto => {
        const server = this.network.server;
        if (!dto) {
          if (!server) return of(undefined);
          return this.requestAndCacheV1(tile, server.osmDataVersions[1]).pipe(map(blob => blob === undefined ? undefined : ({blob, version: server.osmDataVersions[1]})));
        }
        if (server && dto.version < server.osmDataVersions[1])
          return this.requestAndCacheV1(tile, server.osmDataVersions[1]).pipe(map(blob => blob === undefined ? undefined : ({blob: blob || this.used(dto).blob, version: server.osmDataVersions[1]})));
        return of({blob: this.used(dto).blob, version: dto.version});
      }),
      catchError(e => {
        Console.warn('Error getting way tile', tile, e);
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
      firstValueFrom(this.http.getBlob(environment.apiBaseUrl + '/geo-data/v1/ways/' + tile).pipe(
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
          if (e instanceof ApiError && e.httpCode === 404) {
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
    const minX = Math.floor((bounds.getWest() + 180) * 8);
    const maxX = Math.floor((bounds.getEast() + 180) * 8);
    const minY = Math.floor((bounds.getNorth() + 90) * 8);
    const maxY = Math.floor((bounds.getNorth() + 90) * 8);
    const tiles: number[] = [];
    for (let x = minX; x <= maxX; ++x) {
      for (let y = minY; y <= maxY; ++y) {
        tiles.push(y * 360 * 8 + x);
      }
    }
    return tiles;
  }

  private clean(): Promise<string> {
    return firstValueFrom(this.table.deleteWhere$(new DbTableWhereLessThan('lastUsed', Date.now() - CACHE_EXPIRATION))).then(nb => '' + nb);
  }

}

interface DbDto {
  tile: string;
  version: number;
  lastUsed: number;
  blob: Blob | null;
}
