import { WorkerService } from 'src/app/worker/web-app';
import { DbTableWithBlob } from '../database/storage/db-table-with-blob';
import { HttpService } from '../http/http.service';
import { NetworkService } from '../network/network.service';
import { PendingRequests } from 'src/app/utils/pending-requests';
import { Injector } from '@angular/core';
import { catchError, debounceTime, firstValueFrom, forkJoin, from, map, Observable, of, Subscriber, switchMap, tap } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiError } from '../http/api-error';
import { Console } from 'src/app/utils/console';
import { Way } from './way';
import { DbTableWhereLessThan } from '../database/storage/db-table';

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
    this.table.whenReady$().pipe(debounceTime(180000)).subscribe(() => this.clean());
  }

  public getWays(bounds: L.LatLngBounds): Observable<WaysResponse> {
    const boundsTiles = this.boundsToTiles(bounds);
    if (boundsTiles.length === 0) return of({ways: [], done: true, partial: false});
    return new Observable<WaysResponse>(subscriber => {
      this.processWaysTiles([], boundsTiles, bounds, false, subscriber);
    });
  }

  private processWaysTiles(tilesProcessed: number[], tilesToProcess: number[], bounds: L.LatLngBounds, partial: boolean, subscriber: Subscriber<WaysResponse>) {
    forkJoin(tilesToProcess.map(tileNumber =>
      this.getTile('' + tileNumber).pipe(
        switchMap(blob => {
          if (blob === undefined) return of(undefined);
          if (blob === null) return of(null);
          return this.worker.parseWays(blob, bounds);
        }),
        tap(response => {
          if (response) subscriber.next({ways: response.ways, done: false, partial: false});
        })
      )
    )).subscribe(responses => {
      const newProcessed = [...tilesProcessed, ...tilesToProcess];
      const newToProcess: number[] = [];
      for (const response of responses) {
        if (response) {
          for (const reference of response.references) {
            if (!newProcessed.includes(reference.tile) && !newToProcess.includes(reference.tile))
              newToProcess.push(reference.tile);
          }
        } else if (response === undefined) {
          partial = true;
        }
      }
      if (newToProcess.length === 0 || tilesProcessed.length > 0) { // only one level of references
        subscriber.next({ways: [], done: true, partial});
        subscriber.complete();
      } else {
        this.processWaysTiles(newProcessed, newToProcess, bounds, partial, subscriber);
      }
    });
  }

  /** return the blob, or null if no blob exists, or undefined if not in cache and no network */
  private getTile(tile: string): Observable<Blob | null | undefined> {
    return this.table.getByKey$(tile).pipe(
      switchMap(dto => {
        const server = this.network.server;
        if (!dto) {
          if (!server) return of(undefined);
          return this.requestAndCacheV1(tile, server.osmDataVersions[1]);
        }
        if (server && dto.version < server.osmDataVersions[1])
          return this.requestAndCacheV1(tile, server.osmDataVersions[1]).pipe(map(blob => blob || this.used(dto).blob));
        return of(this.used(dto).blob);
      })
    );
  }

  private used(dto: DbDto): DbDto {
    dto.lastUsed = Date.now();
    this.table.setOne$(dto).subscribe();
    return dto;
  }

  private requestAndCacheV1(tile: string, version: number): Observable<Blob | null | undefined> {
    return from(this.pendingRequests.request(tile, () =>
      firstValueFrom(this.http.getBlob(environment.apiBaseUrl + '/geo-data/v1/ways/' + tile).pipe(
        switchMap(blob => this.table.setOne$({ // TODO save in background ?
            tile,
            version,
            lastUsed: Date.now(),
            blob,
          })
        ),
        map(dto => dto.blob),
        catchError(e => {
          if (e instanceof ApiError && e.httpCode === 404) return of(null); // TODO save with null
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

  private clean(): void {
    this.table.deleteWhere$(new DbTableWhereLessThan('lastUsed', Date.now() - 90 * 24 * 60 * 60 * 1000))
    .subscribe(nb => Console.info(nb, 'ways not used since 90 days cleant'));
  }

}

interface DbDto {
  tile: string;
  version: number;
  lastUsed: number;
  blob: Blob;
}

export interface WaysResponse {
  ways: Way[];
  done: boolean;
  partial: boolean;
}
