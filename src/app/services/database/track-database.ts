import { BehaviorSubject, EMPTY, Observable, Subscription, catchError, combineLatest, concat, debounceTime, defaultIfEmpty, filter, first, from, interval, map, of, switchMap, takeWhile, tap, timer, zip } from "rxjs";
import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "./database.service";
import Dexie, { PromiseExtended, Table } from "dexie";
import { TrackDto } from "src/app/model/dto/track";
import { Track } from "src/app/model/track";
import { StoreSyncStatus } from "./store";
import { RequestLimiter } from "src/app/utils/request-limiter";
import { environment } from "src/environments/environment";
import { HttpService } from "../http/http.service";
import { UpdatesResponse } from "./owned-store";
import { NetworkService } from "../network/network.service";
import { OwnedDto, VersionDto } from "src/app/model/dto/owned";
import { Injector, NgZone } from "@angular/core";
import { DatabaseCleanupService } from './database-cleanup.service';
import { TrailService } from './trail.service';
import { TrackService } from './track.service';
import { PreferencesService } from '../preferences/preferences.service';

export interface TrackMetadataSnapshot {
  uuid: string;
  owner: string;
  createdAt: number;
  updatedAt: number;
  distance: number;
  positiveElevation?: number;
  negativeElevation?: number;
  highestAltitude?: number;
  lowestAltitude?: number;
  duration: number;
  startDate?: number;
  bounds?: L.LatLngTuple[];
  breaksDuration: number;
  estimatedDuration: number;
}

interface MetadataItem extends TrackMetadataSnapshot {
  key: string;
}

export interface SimplifiedTrackSnapshot {
  points: SimplifiedPoint[];
}
export interface SimplifiedPoint {
  lat: number;
  lng: number;
  ele?: number;
  time?: number;
}

interface SimplifiedTrackItem extends SimplifiedTrackSnapshot {
  key: string;
}

interface TrackItem {
  key: string;
  uuid: string;
  owner: string;
  version: number;
  updatedLocally: number;
  needsSync: number;
  track?: TrackDto;
}

const AUTO_UPDATE_FROM_SERVER_EVERY = 30 * 60 * 1000;
const MINIMUM_SYNC_INTERVAL = 30 * 1000;

export class TrackDatabase {

  constructor(
    private injector: Injector,
  ) {
    injector.get(DatabaseService).registerStore(this.syncStatus$);
    injector.get(AuthService).auth$.subscribe(
      auth => {
        if (!auth) this.close();
        else this.open(auth.email);
      }
    );
    this.initSync();
  }

  private db?: Dexie;
  private openEmail?: string;
  private preferencesSubscription?: Subscription;

  private close() {
    if (this.db) {
      this.injector.get(DatabaseCleanupService).unregister(this._cleanupCallback);
      console.log('Close track DB')
      this.db.close();
      this.openEmail = undefined;
      this.db = undefined;
      this.syncStatus$.next(null);
      this.preferencesSubscription?.unsubscribe();
      this.preferencesSubscription = undefined;
    }
  }

  private open(email: string): void {
    if (this.openEmail === email) return;
    this.close();
    console.log('Open track DB for user ' + email);
    this.openEmail = email;
    const db = new Dexie('trailence_tracks_' + email);
    const schemaV1: any = {};
    schemaV1['metadata'] = 'key';
    schemaV1['simplified_tracks'] = 'key';
    schemaV1['full_tracks'] = 'key, version, updatedLocally, owner, needsSync';
    db.version(1).stores(schemaV1);
    this.metadataTable = db.table<MetadataItem, string>('metadata');
    this.simplifiedTrackTable = db.table<SimplifiedTrackItem, string>('simplified_tracks')
    this.fullTrackTable = db.table<TrackItem, string>('full_tracks')
    this.db = db;
    this.syncStatus$.next(new TrackSyncStatus());
    this.registerCleanup();
    let previousBaseSpeed: number | undefined = undefined;
    let previousBreakDuration: number | undefined = undefined;
    let previousBreakDistance: number | undefined = undefined;
    this.preferencesSubscription = this.injector.get(PreferencesService).preferences$.pipe(
      debounceTime(5000),
    ).subscribe(
      prefs => {
        let speedChanged = false;
        if (previousBaseSpeed === undefined)
          previousBaseSpeed = prefs.estimatedBaseSpeed;
        else if (previousBaseSpeed !== prefs.estimatedBaseSpeed) {
          speedChanged = true;
          previousBaseSpeed = prefs.estimatedBaseSpeed;
        }

        let breaksChanged = false;
        if (previousBreakDuration === undefined)
          previousBreakDuration = prefs.longBreakMinimumDuration;
        else if (previousBreakDuration !== prefs.longBreakMinimumDuration) {
          breaksChanged = true;
          previousBreakDuration = prefs.longBreakMinimumDuration;
        }
        if (previousBreakDistance === undefined)
          previousBreakDistance = prefs.longBreakMaximumDistance;
        else if (previousBreakDistance !== prefs.longBreakMaximumDistance) {
          breaksChanged = true;
          previousBreakDistance = prefs.longBreakMaximumDistance;
        }

        if (speedChanged || breaksChanged) {
          if (!this.db || !this.metadataTable || !this.fullTrackTable) return;
          this.db?.transaction('rw', [this.fullTrackTable, this.metadataTable], () => {
            this.fullTrackTable?.each(trackItem => {
              if (!trackItem.track || trackItem.version === -1) return;
              const track = new Track(trackItem.track, this.injector.get(PreferencesService));
              let meta$ = this.metadata.get(trackItem.key);
              if (meta$ && meta$.value) {
                const meta = meta$.value;
                if (speedChanged) meta.estimatedDuration = track.computedMetadata.estimatedDurationSnapshot();
                if (breaksChanged) meta.breaksDuration = track.computedMetadata.breakDurationSnapshot();
                meta$.next(meta);
                this.metadataTable?.put({
                  key: trackItem.key,
                  ...meta
                });
              } else {
                this.metadataTable?.put({
                  key: trackItem.key,
                  ...this.toMetadata(track)
                });
              }
            });
          })
        }
      }
    );
  }

  private _cleanupCallback = () => this.cleanup();
  private registerCleanup(): void {
    const db = this.db;
    this._cleanupCallback = () => {
      if (this.db === db) return this.cleanup();
      return of(false);
    };
    this.injector.get(DatabaseCleanupService).register(
      interval(30000).pipe(
        takeWhile(() => this.db === db),
        filter(() => !this.syncStatus$.value?.needsSync && !this.syncStatus$.value?.inProgress),
        first(),
      ),
      this._cleanupCallback
    );
  }
  private cleanup(): Observable<any> {
    // remove all tracks not linked by any trail
    const db = this.db;
    return this.injector.get(TrailService).getAll$().pipe(
      switchMap(trails$ => trails$.length === 0 ? of([]) : combineLatest(trails$)),
      first(),
      switchMap(trails => {
        if (this.db !== db) return of(false);
        const allKnownKeys: string[] = [];
        for (const trail of trails) {
          if (trail) {
            allKnownKeys.push(trail.originalTrackUuid + '#' + trail.owner);
            if (trail.currentTrackUuid !== trail.originalTrackUuid)
              allKnownKeys.push(trail.currentTrackUuid + '#' + trail.owner);
          }
        }
        return from(this.metadataTable!.toCollection().primaryKeys()).pipe(
          map(keys => {
            const eligibleKeys: string[] = [];
            for (const key of keys) {
              if (allKnownKeys.indexOf(key) < 0) {
                eligibleKeys.push(key);
              }
            }
            return eligibleKeys;
          }),
          switchMap(keys => {
            if (keys.length === 0) return of([]);
            if (this.db !== db) return of([]);
            return from(this.metadataTable!.bulkGet(keys));
          }),
          map(items => {
            console.log('Tracks cleanup: ' + items.length + ' to delete');
            for (const item of items) {
              if (item && item.updatedAt < Date.now() - 24 * 60 * 60 * 1000)
                this.injector.get(TrackService).deleteByUuidAndOwner(item.uuid, item.owner);
            }
            return true;
          })
        )
      })
    );
  }

  private metadataTable?: Table<MetadataItem, string>;
  private metadata = new Map<string, BehaviorSubject<TrackMetadataSnapshot | null>>();

  public getMetadata$(uuid: string, owner: string): Observable<TrackMetadataSnapshot | null> {
    const key = uuid + '#' + owner;
    let item$ = this.metadata.get(key);
    if (!item$) {
      item$ = new BehaviorSubject<TrackMetadataSnapshot | null>(null);
      this.loadMetadata(key, item$);
      this.metadata.set(key, item$);
    }
    return item$;
  }

  private metadataKeysToLoad = new Map<string, BehaviorSubject<TrackMetadataSnapshot | null>>();
  private metadataLoadingTimeout?: any;

  private loadMetadata(key: string, item$: BehaviorSubject<TrackMetadataSnapshot | null>): void {
    this.metadataKeysToLoad.set(key, item$);
    this.injector.get(NgZone).runOutsideAngular(() => {
      if (!this.metadataLoadingTimeout)
        this.metadataLoadingTimeout = setTimeout(() => {
          this.metadataLoadingTimeout = undefined;
          const map = this.metadataKeysToLoad;
          this.metadataKeysToLoad = new Map();
          this.metadataTable?.bulkGet([...map.keys()])
          .then(items => {
            for (let i = items.length - 1; i >= 0; --i) {
              const item = items[i];
              if (item) map.get(item.key)!.next(item);
            }
          })
        }, 0);
    });
  }

  private simplifiedTrackTable?: Table<SimplifiedTrackItem, string>;
  private simplifiedTracks = new Map<string, BehaviorSubject<SimplifiedTrackSnapshot | null>>();

  public getSimplifiedTrack$(uuid: string, owner: string): Observable<SimplifiedTrackSnapshot | null> {
    const key = uuid + '#' + owner;
    let item$ = this.simplifiedTracks.get(key);
    if (!item$) {
      item$ = new BehaviorSubject<SimplifiedTrackSnapshot | null>(null);
      this.loadSimplifiedTrack(key, item$);
      this.simplifiedTracks.set(key, item$);
    }
    return item$;
  }

  private simplifiedKeysToLoad = new Map<string, BehaviorSubject<SimplifiedTrackSnapshot | null>>();
  private simplifiedLoadingTimeout?: any;

  private loadSimplifiedTrack(key: string, item$: BehaviorSubject<SimplifiedTrackSnapshot | null>): void {
    this.simplifiedKeysToLoad.set(key, item$);
    this.injector.get(NgZone).runOutsideAngular(() => {
      if (!this.simplifiedLoadingTimeout)
        this.simplifiedLoadingTimeout = setTimeout(() => {
          this.simplifiedLoadingTimeout = undefined;
          const map = this.simplifiedKeysToLoad;
          this.simplifiedKeysToLoad = new Map();
          this.simplifiedTrackTable?.bulkGet([...map.keys()])
          .then(items => {
            for (let i = items.length - 1; i >= 0; --i) {
              const item = items[i];
              if (item) map.get(item.key)!.next(item);
            }
          })
        }, 0);
    });
  }

  private fullTrackTable?: Table<TrackItem, string>;
  private fullTracks = new Map<string, BehaviorSubject<Track | null>>();

  public getFullTrack$(uuid: string, owner: string): Observable<Track | null> {
    const key = uuid + '#' + owner;
    let item$ = this.fullTracks.get(key);
    if (!item$) {
      item$ = new BehaviorSubject<Track | null>(null);
      this.loadFullTrack(key, item$);
      this.fullTracks.set(key, item$);
    }
    return item$;
  }

  private loadFullTrack(key: string, item$: BehaviorSubject<Track | null>): void {
    this.fullTrackTable?.get(key)
    .then(item => {
      if (item?.track) item$.next(new Track(item.track, this.injector.get(PreferencesService)));
    });
  }

  private syncStatus$ = new BehaviorSubject<TrackSyncStatus | null>(null);

  private simplify(track: Track): SimplifiedTrackSnapshot {
    const simplified: SimplifiedTrackSnapshot = { points: [] };
    let previous: L.LatLng | undefined;
    for (const segment of track.segments) {
      for (const point of segment.points) {
        const p = point.pos;
        // TODO if the next point is almost in the same direction, we could skip it also
        if (!previous || p.distanceTo(previous) >= 25) {
          simplified.points.push({
            lat: point.pos.lat,
            lng: point.pos.lng,
            ele: point.ele,
            time: point.time,
          });
          previous = p;
        }
      }
    }
    const lastSegment = track.segments[track.segments.length - 1];
    const lastPoint = lastSegment.points[lastSegment.points.length - 1];
    if (previous !== lastPoint.pos) {
      simplified.points.push({
        lat: lastPoint.pos.lat,
        lng: lastPoint.pos.lng,
        ele: lastPoint.ele,
        time: lastPoint.time,
      });
    }
    return simplified;
  }

  private toMetadata(track: Track): TrackMetadataSnapshot {
    const m = track.metadata;
    const b = m.bounds;
    return {
      uuid: track.uuid,
      owner: track.owner,
      createdAt: track.createdAt,
      updatedAt: track.updatedAt,
      distance: m.distance,
      positiveElevation: m.positiveElevation,
      negativeElevation: m.negativeElevation,
      highestAltitude: m.highestAltitude,
      lowestAltitude: m.lowestAltitude,
      duration: m.duration,
      startDate: m.startDate,
      bounds: b ? [[b.getNorth(), b.getWest()], [b.getSouth(), b.getWest()]] : undefined,
      breaksDuration: track.computedMetadata.breakDurationSnapshot(),
      estimatedDuration: track.computedMetadata.estimatedDurationSnapshot(),
    }
  }

  public create(track: Track): void {
    const key = track.uuid + '#' + track.owner;
    const dto = track.toDto();
    const simplified = this.simplify(track);
    const metadata = this.toMetadata(track);
    this.db?.transaction('rw', [this.metadataTable!, this.simplifiedTrackTable!, this.fullTrackTable!], tx => {
      this.fullTrackTable?.add({
        key,
        uuid: dto.uuid,
        owner: dto.owner,
        version: dto.version,
        updatedLocally: 0,
        needsSync: 1,
        track: dto,
      });
      this.simplifiedTrackTable?.add({
        ...simplified,
        key,
      });
      this.metadataTable?.add({
        ...metadata,
        key,
      });
    });
    const full$ = this.fullTracks.get(key);
    if (full$) full$.next(track);
    const simplified$ = this.simplifiedTracks.get(key);
    if (simplified$) simplified$.next(simplified);
    const metadata$ = this.metadata.get(key);
    if (metadata$) metadata$.next(metadata);
    if (!this.syncStatus$.value!.hasLocalChanges) {
      this.syncStatus$.value!.hasLocalChanges = true;
      this.syncStatus$.next(this.syncStatus$.value);
    }
  }

  public update(track: Track): void {
    const key = track.uuid + '#' + track.owner;
    track.updatedAt = Date.now();
    const dto = track.toDto();
    const simplified = this.simplify(track);
    const metadata = this.toMetadata(track);
    this.db?.transaction('rw', [this.metadataTable!, this.simplifiedTrackTable!, this.fullTrackTable!], tx => {
      this.fullTrackTable?.put({
        key,
        uuid: dto.uuid,
        owner: dto.owner,
        version: dto.version,
        updatedLocally: 1,
        needsSync: 1,
        track: dto,
      });
      this.simplifiedTrackTable?.put({
        ...simplified,
        key,
      });
      this.metadataTable?.put({
        ...metadata,
        key,
      });
    });
    const full$ = this.fullTracks.get(key);
    if (full$) full$.next(track);
    const simplified$ = this.simplifiedTracks.get(key);
    if (simplified$) simplified$.next(simplified);
    const metadata$ = this.metadata.get(key);
    if (metadata$) metadata$.next(metadata);
    if (!this.syncStatus$.value!.hasLocalChanges) {
      this.syncStatus$.value!.hasLocalChanges = true;
      this.syncStatus$.next(this.syncStatus$.value);
    }
  }

  public delete(uuid: string, owner: string, ondone?: () => void): void {
    const key = uuid + '#' + owner;
    let dbUpdated: PromiseExtended<void> | Promise<void> | undefined = this.db?.transaction('rw', [this.metadataTable!, this.simplifiedTrackTable!, this.fullTrackTable!], async tx => {
      await this.fullTrackTable?.put({
        key,
        uuid: uuid,
        owner: owner,
        version: -1,
        updatedLocally: 0,
        needsSync: 1,
        track: undefined,
      });
      await this.simplifiedTrackTable?.delete(key);
      await this.metadataTable?.delete(key);
    });
    const full$ = this.fullTracks.get(key);
    if (full$) full$.next(null);
    const simplified$ = this.simplifiedTracks.get(key);
    if (simplified$) simplified$.next(null);
    const metadata$ = this.metadata.get(key);
    if (metadata$) metadata$.next(null);
    if (!dbUpdated) dbUpdated = Promise.resolve();
    dbUpdated.then(() => {
      if (!this.syncStatus$.value!.hasLocalChanges) {
        this.syncStatus$.value!.hasLocalChanges = true;
        this.syncStatus$.next(this.syncStatus$.value);
      }
      if (ondone) ondone();
    });
  }

  public isSavedOnServerAndNotDeletedLocally(uuid: string, owner: string): boolean {
    const key = uuid + '#' + owner;
    if (this.fullTracks.get(key)?.value?.isSavedOnServerAndNotDeletedLocally()) return true;
    // cannot determine synchronously
    return false;
  }

  public isSavedOnServerAndNotDeletedLocally$(uuid: string, owner: string): Observable<boolean> {
    const key = uuid + '#' + owner;
    return combineLatest([
      of(!!this.fullTracks.get(key)?.value?.isSavedOnServerAndNotDeletedLocally()),
      this.syncStatus$.pipe(
        switchMap(status => {
          if (!status || !this.db) return of(false);
          return concat(
            of(false),
            from(this.fullTrackTable!.get(key)).pipe(
              map(item => !!item && item.version > 0)
            )
          );
        })
      )
    ]).pipe(
      map(([ready1, ready2]) => ready1 || ready2)
    );
  }

  private _lastSync = 0;
  private _syncTimeout?: any;

  private initSync(): void {
    // we need to sync when:
    combineLatest([
      this.injector.get(NetworkService).server$,    // network is connected
      this.syncStatus$,           // there is something to sync and we are not syncing
    ]).pipe(
      debounceTime(1000),
      map(([networkConnected, syncStatus]) => networkConnected && syncStatus?.needsSync && !syncStatus?.inProgress),
      filter(shouldSync => {
        if (!shouldSync) return false;
        if (Date.now() - this._lastSync < MINIMUM_SYNC_INTERVAL) {
          if (!this._syncTimeout) {
            this._syncTimeout = setTimeout(() => this.syncStatus$.next(this.syncStatus$.value), Math.max(1000, MINIMUM_SYNC_INTERVAL - (Date.now() - this._lastSync)));
          }
          return false;
        }
        return true;
      }),
      debounceTime(1000),
    )
    .subscribe(() => {
      this._lastSync = Date.now();
      if (this._syncTimeout) clearTimeout(this._syncTimeout);
      this._syncTimeout = undefined;
      this.sync();
    });

    // launch update from server every 30 minutes
    let updateFromServerTimeout: any = undefined;
    let previousDb: Dexie | undefined = undefined;
    this.syncStatus$.subscribe(s => {
      const db = s ? this.db : undefined;
      if (db === previousDb) return;
      previousDb = db;
      if (updateFromServerTimeout) clearTimeout(updateFromServerTimeout);
      updateFromServerTimeout = undefined;
    });
    let previousNeeded = false;
    this.syncStatus$.subscribe(status => {
      if (!previousNeeded && status?.needsUpdateFromServer) {
        previousNeeded = true;
      } else if (previousNeeded && !status?.needsUpdateFromServer) {
        previousNeeded = false;
        if (updateFromServerTimeout) clearTimeout(updateFromServerTimeout);
        updateFromServerTimeout = setTimeout(() => {
          if (this.syncStatus$.value) {
            this.syncStatus$.value.needsUpdateFromServer = true;
            this.syncStatus$.next(this.syncStatus$.value);
          }
        }, AUTO_UPDATE_FROM_SERVER_EVERY);
      }
    });
  }

  private sync(): void {
    console.log('Sync tracks with status ', this.syncStatus$.value);
    const db = this.db!;
    this.syncStatus$.value!.inProgress = true;
    this.syncStatus$.next(this.syncStatus$.value);
    this.syncCreatedLocally(db).pipe(
      switchMap(() => this.db === db ? this.syncDeletedLocally(db) : EMPTY),
      switchMap(() => this.db === db ? this.syncUpdatesFromServer(db) : EMPTY),
      switchMap(() => this.db === db ? this.syncUpdatesToServer(db) : EMPTY),
      switchMap(() => this.db === db ? this.hasLocalChanges() : EMPTY)
    ).subscribe(hasLocalChanges => {
      if (this.db !== db) return;
      const status = this.syncStatus$.value!;
      status.hasLocalChanges = hasLocalChanges;
      status.inProgress = false;
      status.needsUpdateFromServer = false;
      console.log('Sync done for tracks with status ', this.syncStatus$.value);
      this.syncStatus$.next(status);
    });
  }

  private syncCreatedLocally(db: Dexie): Observable<any> {
    return from(this.fullTrackTable!.where('version').equals(0).toArray()).pipe(
      switchMap(items => {
        if (this.db !== db) return EMPTY;
        if (items.length === 0) return of(true);
        console.log('' + items.length + ' tracks to be created on server');
        const limiter = new RequestLimiter(2);
        const requests: Observable<any>[] = [];
        items.forEach(item => {
          const request = () => {
            if (this.db !== db) return EMPTY;
            return this.injector.get(HttpService).post<TrackDto>(environment.apiBaseUrl + '/track/v1', item.track).pipe(
              switchMap(result => {
                if (this.db !== db) return EMPTY;
                return from(this.fullTrackTable!.put({
                  key: result.uuid + '#' + result.owner,
                  uuid: result.uuid,
                  owner: result.owner,
                  version: result.version,
                  updatedLocally: 0,
                  needsSync: 0,
                  track: result,
                }));
              })
            );
          }
          requests.push(limiter.add(request));
        });
        return zip(requests);
      }),
      catchError(error => {
        // TODO
        console.error(error);
        return of(false);
      })
    );
  }

  private syncDeletedLocally(db: Dexie): Observable<any> {
    return from(this.fullTrackTable!.where('version').equals(-1).toArray()).pipe(
      switchMap(items => {
        if (this.db !== db) return EMPTY;
        if (items.length === 0) return of(true);
        console.log('' + items.length + ' tracks to be deleted on server');
        const uuids = items.map(item => item.uuid);
        const keys = items.map(item => item.uuid + '#' + this.openEmail!);
        return this.injector.get(HttpService).post<void>(environment.apiBaseUrl + '/track/v1/_bulkDelete', uuids).pipe(
          defaultIfEmpty(true),
          switchMap(result => {
            if (this.db !== db) return EMPTY;
            return from(this.fullTrackTable!.bulkDelete(keys));
          }),
          catchError(error => {
            // TODO
            console.error(error);
            return of(false);
          })
        );
      })
    );
  }

  private syncUpdatesFromServer(db: Dexie): Observable<any> {
    return from(this.fullTrackTable!.toArray()).pipe(
      switchMap(items => {
        if (this.db !== db) return EMPTY;
        const known: VersionDto[] = [];
        for (const item of items) {
          if (item.version > 0) known.push({uuid: item.uuid, owner: item.owner, version: item.version});
        }
        console.log('Requesting updates from server: ' + known.length + ' tracks known');
        return this.injector.get(HttpService).post<UpdatesResponse<{uuid: string, owner: string}>>(environment.apiBaseUrl + '/track/v1/_bulkGetUpdates', known).pipe(
          switchMap(response => {
            if (this.db !== db) return EMPTY;
            console.log('Server updates for tracks: ' + response.created.length + ' new tracks, ' + response.updated.length + ' updated tracks, ' + response.deleted.length + ' deleted tracks');
            const toRetrieve = [...response.created, ...response.updated];
            const limiter = new RequestLimiter(5);
            const requests = toRetrieve
              .map(item => () => {
                if (this.db !== db) return EMPTY;
                return this.injector.get(HttpService).get<TrackDto>(environment.apiBaseUrl + '/track/v1/' + encodeURIComponent(item.owner) + '/' + item.uuid);
              })
              .map(request => limiter.add(request).pipe(catchError(error => {
                // TODO
                return of(null);
              })));
            return (requests.length === 0 ? of([]) : zip(requests)).pipe(
              switchMap(responses => this.updatesFromServer(db, responses.filter(t => !!t) as TrackDto[], response.deleted))
            );
          }),
          catchError(error => {
            // TODO
            console.error(error);
            return of(false);
          })
        );
      })
    );
  }

  private syncUpdatesToServer(db: Dexie): Observable<any> {
    return from(this.fullTrackTable!.where('updatedLocally').equals(1).toArray()).pipe(
      switchMap(items => {
        if (this.db !== db) return EMPTY;
        if (items.length === 0) return of(true);
        console.log('' + items.length + ' tracks to be updated on server');
        const limiter = new RequestLimiter(2);
        const requests: Observable<TrackDto>[] = [];
        items.forEach(item => {
          const request = () => {
            if (this.db !== db) return EMPTY;
            return this.injector.get(HttpService).put<TrackDto>(environment.apiBaseUrl + '/track/v1', item.track);
          }
          requests.push(limiter.add(request));
        });
        return (requests.length === 0 ? of([]) : zip(requests)).pipe(
          switchMap(responses => this.updatesFromServer(db, responses, []))
        );
      }),
      catchError(error => {
        // TODO
        console.error(error);
        return of(false);
      })
    );
  }

  private updatesFromServer(db: Dexie, tracks: TrackDto[], deleted: { uuid: string, owner: string }[]): Observable<any> {
    if (this.db !== db) return EMPTY;
    if (tracks.length === 0 && deleted.length === 0) return of(true);
    return from(this.db?.transaction('rw', [this.metadataTable!, this.simplifiedTrackTable!, this.fullTrackTable!], async tx => {
      if (deleted.length > 0) {
        const keys = deleted.map(item => item.uuid + '#' + item.owner);
        if (this.db !== db) return;
        await this.metadataTable!.bulkDelete(keys);
        if (this.db !== db) return;
        await this.simplifiedTrackTable!.bulkDelete(keys);
        if (this.db !== db) return;
        await this.fullTrackTable!.bulkDelete(keys);
        if (this.db !== db) return;
        keys.forEach(key => {
          this.fullTracks.get(key)?.next(null);
          this.simplifiedTracks.get(key)?.next(null);
          this.metadata.get(key)?.next(null);
        });
        if (this.db !== db) return;
      }
      if (tracks.length > 0) {
        const fulls = tracks.map(track => ({
          key: track.uuid + '#' + track.owner,
          uuid: track.uuid,
          owner: track.owner,
          version: track.version,
          updatedLocally: 0,
          needsSync: 0,
          track: track,
        }));
        await this.fullTrackTable!.bulkPut(fulls);
        const entities = tracks.map(track => new Track(track, this.injector.get(PreferencesService)));
        if (this.db !== db) return;
        entities.forEach(entity => {
          this.fullTracks.get(entity.uuid + '#' + entity.owner)?.next(entity);
        })
        const simplified = entities.map(track => ({...this.simplify(track), key: track.uuid + '#' + track.owner}));
        if (this.db !== db) return;
        await this.simplifiedTrackTable!.bulkPut(simplified);
        if (this.db !== db) return;
        simplified.forEach(s => this.simplifiedTracks.get(s.key)?.next(s));
        const metadata = entities.map(track => ({...this.toMetadata(track), key: track.uuid + '#' + track.owner}));
        if (this.db !== db) return;
        await this.metadataTable!.bulkPut(metadata);
        if (this.db !== db) return;
        metadata.forEach(m => this.metadata.get(m.key)?.next(m));
      }
    })).pipe(defaultIfEmpty(true));
  }

  private hasLocalChanges(): Observable<boolean> {
    return from(this.fullTrackTable!.where('needsSync').equals(1).first()).pipe(
      map(result => !!result)
    );
  }

}

class TrackSyncStatus implements StoreSyncStatus {

  hasLocalChanges = true;
  inProgress = false;
  needsUpdateFromServer = true;

  get needsSync(): boolean {
    return this.hasLocalChanges || this.needsUpdateFromServer;
  }

}
