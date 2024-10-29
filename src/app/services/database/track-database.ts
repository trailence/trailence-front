import { BehaviorSubject, EMPTY, Observable, Subscription, catchError, combineLatest, concat, debounceTime, defaultIfEmpty, first, from, map, of, switchMap, tap, zip } from "rxjs";
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
import { VersionDto } from "src/app/model/dto/owned";
import { Injector, NgZone } from "@angular/core";
import { TrailService } from './trail.service';
import { TrackService } from './track.service';
import { PreferencesService } from '../preferences/preferences.service';
import { DatabaseSubject } from './database-subject';
import { DatabaseSubjectService } from './database-subject-service';
import { ProgressService } from '../progress/progress.service';
import { I18nService } from '../i18n/i18n.service';
import { CompositeOnDone } from 'src/app/utils/callback-utils';
import { ErrorService } from '../progress/error.service';
import { Console } from 'src/app/utils/console';

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
  duration?: number;
  startDate?: number;
  bounds?: L.LatLngTuple[];
  breaksDuration: number;
  estimatedDuration: number;
  localUpdate: number;
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

const MINIMUM_SYNC_INTERVAL = 30 * 1000;

export class TrackDatabase {

  constructor(
    private readonly injector: Injector,
  ) {
    this.ngZone = injector.get(NgZone);
    this.subjectService = injector.get(DatabaseSubjectService);
    injector.get(DatabaseService).registerStore({
      status$: this.syncStatus$,
      loaded$: of(true),
      canSync$: of(true),
      fireSyncStatus: () => this.syncStatus$.next(this.syncStatus$.value),
      syncFromServer: () => this.triggerSyncFromServer(),
      doSync: () => this.sync(),
    });
    injector.get(AuthService).auth$.subscribe(
      auth => {
        if (!auth) this.close();
        else this.open(auth.email);
      }
    );
  }

  private readonly subjectService: DatabaseSubjectService;
  private db?: Dexie;
  private openEmail?: string;
  private preferencesSubscription?: Subscription;
  private readonly ngZone: NgZone;
  private readonly syncStatus$ = new BehaviorSubject<TrackSyncStatus | null>(null);

  private close() {
    this.ngZone.runOutsideAngular(() => {
      if (this.db) {
        Console.info('Close track DB')
          this.db.close();
        this.openEmail = undefined;
        this.db = undefined;
        this.syncStatus$.next(null);
        this.preferencesSubscription?.unsubscribe();
        this.preferencesSubscription = undefined;
        this.metadataKeysToLoad.clear();
        this.simplifiedKeysToLoad.clear();
        for (const s of this.metadata.values()) s.close();
        this.metadata.clear();
        for (const s of this.simplifiedTracks.values()) s.close();
        this.simplifiedTracks.clear();
        for (const s of this.fullTracks.values()) s.close();
        this.fullTracks.clear();
      }
    });
  }

  private open(email: string): void {
    if (this.openEmail === email) return;
    this.close();
    this.ngZone.runOutsideAngular(() => {
      Console.info('Open track DB for user ' + email);
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
      const status = new TrackSyncStatus();
      from(this.fullTrackTable.where('version').belowOrEqual(0).limit(1).toArray()).pipe(
        switchMap(r1 => {
          if (r1.length > 0) return of(true);
          return from(this.fullTrackTable!.where('updatedLocally').equals(1).limit(1).toArray()).pipe(
            map(r2 => r2.length > 0)
          );
        }),
        first(),
      ).subscribe(hasLocalChanges => {
        if (this.db === db) {
          status.hasLocalChanges = hasLocalChanges;
          this.syncStatus$.next(status);
        }
      });
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
                if (meta$?.loadedValue) {
                  const meta = meta$.loadedValue;
                  if (speedChanged) meta.estimatedDuration = track.computedMetadata.estimatedDurationSnapshot();
                  if (breaksChanged) meta.breaksDuration = track.computedMetadata.breakDurationSnapshot();
                  meta$.newValue(meta);
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
    });
  }

  public cleanDatabase(db: Dexie, email: string): Observable<any> {
    // remove all tracks not linked by any trail
    return this.injector.get(TrailService).getAll$().pipe(
      switchMap(trails$ => trails$.length === 0 ? of([]) : combineLatest(trails$)),
      first(),
      switchMap(trails => {
        const dbService = this.injector.get(DatabaseService);
        if (db !== dbService.db || email !== dbService.email) return of(false);
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
            if (db !== dbService.db || email !== dbService.email) return [];
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
            if (this.openEmail !== email) return of([]);
            return from(this.metadataTable!.bulkGet(keys));
          }),
          map(items => {
            if (db !== dbService.db || email !== dbService.email) return false;
            items = items.filter(i => i && i.localUpdate < Date.now() - 24 * 60 * 60 * 1000 && i.updatedAt < Date.now() - 24 * 60 * 60 * 1000);
            Console.info('Tracks cleanup: ' + items.length + ' to delete');
            for (const item of items) {
              this.injector.get(TrackService).deleteByUuidAndOwner(item!.uuid, item!.owner);
            }
            return true;
          })
        )
      })
    );
  }

  private metadataTable?: Table<MetadataItem, string>;
  private readonly metadata = new Map<string, DatabaseSubject<TrackMetadataSnapshot>>();

  public getMetadata$(uuid: string, owner: string): Observable<TrackMetadataSnapshot | null> {
    const key = uuid + '#' + owner;
    let item$ = this.metadata.get(key);
    if (!item$) {
      item$ = new DatabaseSubject<TrackMetadataSnapshot>(this.subjectService, 'TrackMetadataSnapshot', () => this.loadMetadata(key));
      this.metadata.set(key, item$);
    }
    return item$.asObservable();
  }

  private metadataKeysToLoad = new Map<string, (item: TrackMetadataSnapshot | null) => void>();
  private metadataLoadingTimeout?: any;

  private loadMetadata(key: string): Promise<TrackMetadataSnapshot | null> {
    return new Promise<TrackMetadataSnapshot | null>((resolve) => {
      this.metadataKeysToLoad.set(key, resolve);
      if (this.metadataLoadingTimeout) return;
      this.ngZone.runOutsideAngular(() => {
        if (!this.metadataLoadingTimeout)
          this.metadataLoadingTimeout = setTimeout(() => {
            this.metadataLoadingTimeout = undefined;
            const map = this.metadataKeysToLoad;
            this.metadataKeysToLoad = new Map();
            let keys = [...map.keys()];
            this.metadataTable?.bulkGet(keys)
            .then(items => {
              for (let i = items.length - 1; i >= 0; --i) {
                const item = items[i];
                if (item) {
                  map.get(item.key)!(item);
                } else {
                  map.get(keys[i])!(null);
                }
              }
            })
          }, 0);
      });
    });
  }

  public getAllMetadata$(): Observable<Observable<TrackMetadataSnapshot | null>[]> {
    return this.ngZone.runOutsideAngular(() => {
      if (!this.metadataTable) return of([]);
      return from(this.metadataTable.toArray()).pipe(
        map(items => {
          const result = [];
          for (const item of items) {
            const key = item.uuid + '#' + item.owner;
            let item$ = this.metadata.get(key);
            if (item$) {
              item$.newValue(item);
            } else {
              item$ = new DatabaseSubject<TrackMetadataSnapshot>(this.subjectService, 'TrackMetadataSnapshot', () => this.loadMetadata(key), undefined, item);
              this.metadata.set(key, item$);
            }
            result.push(item$.asObservable());
          }
          return result;
        })
      )
    });
  }

  private simplifiedTrackTable?: Table<SimplifiedTrackItem, string>;
  private readonly simplifiedTracks = new Map<string, DatabaseSubject<SimplifiedTrackSnapshot>>();

  public getSimplifiedTrack$(uuid: string, owner: string): Observable<SimplifiedTrackSnapshot | null> {
    const key = uuid + '#' + owner;
    let item$ = this.simplifiedTracks.get(key);
    if (!item$) {
      item$ = new DatabaseSubject<SimplifiedTrackSnapshot>(this.subjectService, 'SimplifiedTrackSnapshot', () => this.loadSimplifiedTrack(key));
      this.simplifiedTracks.set(key, item$);
    }
    return item$.asObservable();
  }

  private simplifiedKeysToLoad = new Map<string, (item: SimplifiedTrackSnapshot | null) => void>();
  private simplifiedLoadingTimeout?: any;

  private loadSimplifiedTrack(key: string): Promise<SimplifiedTrackSnapshot | null> {
    return new Promise<SimplifiedTrackSnapshot | null>((resolve) => {
      this.simplifiedKeysToLoad.set(key, resolve);
      if (this.simplifiedLoadingTimeout) return;
      this.ngZone.runOutsideAngular(() => {
        if (!this.simplifiedLoadingTimeout)
          this.simplifiedLoadingTimeout = setTimeout(() => {
            this.simplifiedLoadingTimeout = undefined;
            const map = this.simplifiedKeysToLoad;
            this.simplifiedKeysToLoad = new Map();
            let keys = [...map.keys()];
            this.simplifiedTrackTable?.bulkGet(keys)
            .then(items => {
              for (let i = items.length - 1; i >= 0; --i) {
                const item = items[i];
                if (item) {
                  map.get(item.key)!(item);
                } else {
                  map.get(keys[i])!(null)
                }
              }
            })
          }, 0);
      });
    });
  }

  private fullTrackTable?: Table<TrackItem, string>;
  private readonly fullTracks = new Map<string, DatabaseSubject<Track>>();

  public getFullTrack$(uuid: string, owner: string): Observable<Track | null> {
    const key = uuid + '#' + owner;
    let item$ = this.fullTracks.get(key);
    if (!item$) {
      item$ = new DatabaseSubject<Track>(this.subjectService, 'Track', () => this.loadFullTrack(key));
      this.fullTracks.set(key, item$);
    }
    return item$.asObservable();
  }

  private loadFullTrack(key: string): Promise<Track | null> {
    if (!this.fullTrackTable) return Promise.resolve(null);
    return this.fullTrackTable.get(key)
    .then(item => {
      if (item?.track) return new Track(item.track, this.injector.get(PreferencesService));
      return null;
    });
  }

  private simplify(track: Track): SimplifiedTrackSnapshot {
    const simplified: SimplifiedTrackSnapshot = { points: [] };
    let previous: L.LatLng | undefined;
    for (const segment of track.segments) {
      for (const point of segment.points) {
        const p = point.pos;
        if (!previous || p.distanceTo(previous) >= 25) {
          const newPoint: SimplifiedPoint = {
            lat: point.pos.lat,
            lng: point.pos.lng,
            ele: point.ele,
            time: point.time,
          };
          if (previous && simplified.points.length > 1) {
            const angle1 = Math.atan2(p.lat - previous.lat, p.lng - previous.lng);
            const pprevious = simplified.points[simplified.points.length - 2];
            const angle2 = Math.atan2(previous.lat - pprevious.lat, previous.lng - pprevious.lng);
            if (Math.abs(angle1 - angle2) < 0.35) {
              simplified.points[simplified.points.length - 1] = newPoint;
              previous = p;
              continue;
            }
          }
          simplified.points.push(newPoint);
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
      bounds: b ? [[b.getNorth(), b.getEast()], [b.getSouth(), b.getWest()]] : undefined,
      breaksDuration: track.computedMetadata.breakDurationSnapshot(),
      estimatedDuration: track.computedMetadata.estimatedDurationSnapshot(),
      localUpdate: Date.now(),
    }
  }

  public create(track: Track, ondone?: () => void): void {
    this.ngZone.runOutsideAngular(() => {
      const key = track.uuid + '#' + track.owner;
      const dto = track.toDto();
      const simplified = this.simplify(track);
      const metadata = this.toMetadata(track);
      const stepsDone = new CompositeOnDone(ondone);
      this.db?.transaction('rw', [this.metadataTable!, this.simplifiedTrackTable!, this.fullTrackTable!], tx => {
        const onDone1 = stepsDone.add();
        this.fullTrackTable?.add({
          key,
          uuid: dto.uuid,
          owner: dto.owner,
          version: dto.version,
          updatedLocally: 0,
          needsSync: 1,
          track: dto,
        }).then(onDone1);
        const onDone2 = stepsDone.add();
        this.simplifiedTrackTable?.add({
          ...simplified,
          key,
        }).then(onDone2);
        const onDone3 = stepsDone.add();
        this.metadataTable?.add({
          ...metadata,
          key,
        }).then(onDone3);
      });
      const full$ = this.fullTracks.get(key);
      if (full$) full$.newValue(track);
      else this.fullTracks.set(key, new DatabaseSubject<Track>(this.subjectService, 'Track', () => this.loadFullTrack(key), undefined, track));
      const simplified$ = this.simplifiedTracks.get(key);
      if (simplified$) simplified$.newValue(simplified);
      else this.simplifiedTracks.set(key, new DatabaseSubject<SimplifiedTrackSnapshot>(this.subjectService, 'SimplifiedTrackSnapshot', () => this.loadSimplifiedTrack(key), undefined, simplified));
      const metadata$ = this.metadata.get(key);
      if (metadata$) metadata$.newValue(metadata);
      else this.metadata.set(key, new DatabaseSubject<TrackMetadataSnapshot>(this.subjectService, 'TrackMetadataSnapshot', () => this.loadMetadata(key), undefined, metadata));
      if (!this.syncStatus$.value!.hasLocalChanges) {
        this.syncStatus$.value!.hasLocalChanges = true;
        this.syncStatus$.next(this.syncStatus$.value);
      }
      const onDone4 = stepsDone.add();
      stepsDone.start();
      onDone4();
    });
  }

  public update(track: Track): void {
    this.ngZone.runOutsideAngular(() => {
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
      if (full$) full$.newValue(track);
      else this.fullTracks.set(key, new DatabaseSubject<Track>(this.subjectService, 'Track', () => this.loadFullTrack(key), undefined, track));
      const simplified$ = this.simplifiedTracks.get(key);
      if (simplified$) simplified$.newValue(simplified);
      else this.simplifiedTracks.set(key, new DatabaseSubject<SimplifiedTrackSnapshot>(this.subjectService, 'SimplifiedTrackSnapshot', () => this.loadSimplifiedTrack(key), undefined, simplified));
      const metadata$ = this.metadata.get(key);
      if (metadata$) metadata$.newValue(metadata);
      else this.metadata.set(key, new DatabaseSubject<TrackMetadataSnapshot>(this.subjectService, 'TrackMetadataSnapshot', () => this.loadMetadata(key), undefined, metadata));
      if (!this.syncStatus$.value!.hasLocalChanges) {
        this.syncStatus$.value!.hasLocalChanges = true;
        this.syncStatus$.next(this.syncStatus$.value);
      }
    });
  }

  public delete(uuid: string, owner: string, ondone?: () => void): void {
    this.ngZone.runOutsideAngular(() => {
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
      if (full$) full$.newValue(null);
      const simplified$ = this.simplifiedTracks.get(key);
      if (simplified$) simplified$.newValue(null);
      const metadata$ = this.metadata.get(key);
      if (metadata$) metadata$.newValue(null);
      if (!dbUpdated) dbUpdated = Promise.resolve();
      dbUpdated.then(() => {
        if (!this.syncStatus$.value!.hasLocalChanges) {
          this.syncStatus$.value!.hasLocalChanges = true;
          this.syncStatus$.next(this.syncStatus$.value);
        }
        if (ondone) ondone();
      });
    });
  }

  public isSavedOnServerAndNotDeletedLocally(uuid: string, owner: string): boolean {
    const key = uuid + '#' + owner;
    if (this.fullTracks.get(key)?.loadedValue?.isSavedOnServerAndNotDeletedLocally()) return true;
    // cannot determine synchronously
    return false;
  }

  public isSavedOnServerAndNotDeletedLocally$(uuid: string, owner: string): Observable<boolean> {
    const key = uuid + '#' + owner;
    return combineLatest([
      this.getFullTrack$(uuid, owner).pipe(
        map(track => track?.isSavedOnServerAndNotDeletedLocally())
      ),
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

  private triggerSyncFromServer(): void {
    if (this.syncStatus$.value && !this.syncStatus$.value.needsUpdateFromServer) {
      this.syncStatus$.value.needsUpdateFromServer = true;
      this.syncStatus$.next(this.syncStatus$.value);
    }
  }

  private sync(): void {
    this.ngZone.runOutsideAngular(() => {
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
        status.lastUpdateFromServer = Date.now();
        this.syncStatus$.next(status);
      });
    });
  }

  private syncCreatedLocally(db: Dexie): Observable<any> {
    return from(this.fullTrackTable!.where('version').equals(0).limit(50).toArray()).pipe(
      switchMap(items => {
        if (this.db !== db) return EMPTY;
        if (items.length === 0) return of(true);
        Console.info('' + items.length + ' tracks to be created on server');
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
              }),
              catchError(e => {
                Console.error('error creating track on server', item.track, e);
                this.injector.get(ErrorService).addNetworkError(e, 'errors.stores.save_track', []);
                return EMPTY;
              })
            );
          }
          requests.push(limiter.add(request));
        });
        if (requests.length === 0) return of([]);
        return zip(requests).pipe(defaultIfEmpty(false));
      }),
      catchError(error => {
        // should not happen
        Console.error('error creating tracks on server', error);
        return of(false);
      })
    );
  }

  private syncDeletedLocally(db: Dexie): Observable<any> {
    return from(this.fullTrackTable!.where('version').equals(-1).limit(50).toArray()).pipe(
      switchMap(items => {
        if (this.db !== db) return EMPTY;
        if (items.length === 0) return of(true);
        Console.info('' + items.length + ' tracks deleted locally');
        const keys = items.map(item => item.uuid + '#' + item.owner);
        const uuids = items.filter(item => item.owner === this.openEmail!).map(item => item.uuid);
        Console.info('' + uuids.length + ' tracks to be deleted on server');
        return (uuids.length > 0 ? this.injector.get(HttpService).post<void>(environment.apiBaseUrl + '/track/v1/_bulkDelete', uuids) : EMPTY).pipe(
          defaultIfEmpty(true),
          switchMap(result => {
            if (this.db !== db) return EMPTY;
            return from(this.fullTrackTable!.bulkDelete(keys));
          }),
          catchError(error => {
            this.injector.get(ErrorService).addNetworkError(error, 'errors.stores.delete_tracks', []);
            Console.error('Error deleting tracks from the server', error);
            return of(false);
          })
        );
      })
    );
  }

  private syncUpdatesFromServer(db: Dexie): Observable<any> {
    const known: VersionDto[] = [];
    return from(this.fullTrackTable!.where('version').above(0).each(item => known.push({uuid: item.uuid, owner: item.owner, version: item.version}))).pipe(
      switchMap(() => {
        if (this.db !== db) return EMPTY;
        return this.injector.get(HttpService).post<UpdatesResponse<{uuid: string, owner: string}>>(environment.apiBaseUrl + '/track/v1/_bulkGetUpdates', known).pipe(
          switchMap(response => {
            if (this.db !== db) return EMPTY;
            Console.info('Server updates for tracks: sent ' + known.length + ' known tracks, received ' + response.created.length + ' new tracks, ' + response.updated.length + ' updated tracks, ' + response.deleted.length + ' deleted tracks');
            let operations$: Observable<any>;
            if (response.deleted.length > 0) {
              operations$ = this.updatesFromServer(db, [], response.deleted);
            } else {
              operations$ = of(true);
            }
            const toRetrieve = [...response.created, ...response.updated];
            if (toRetrieve.length > 0) {
              const progress = this.injector.get(ProgressService).create(this.injector.get(I18nService).texts.synchronizing_your_data, toRetrieve.length);
              progress.subTitle = '0/' + toRetrieve.length;
              let done = 0;
              for (let i = 0; i < toRetrieve.length; i += 20) {
                const bunch = toRetrieve.slice(i, Math.min(toRetrieve.length, i + 20));
                const limiter = new RequestLimiter(3);
                const requests = bunch
                .map(item => () => {
                  if (this.db !== db) {
                    progress.done();
                    return EMPTY;
                  }
                  return this.injector.get(HttpService).get<TrackDto>(environment.apiBaseUrl + '/track/v1/' + encodeURIComponent(item.owner) + '/' + item.uuid);
                })
                .map(request => limiter.add(request).pipe(
                  tap(() => {
                    done++;
                    progress.addWorkDone(1);
                    progress.subTitle = '' + done + '/' + toRetrieve.length;
                  }),
                  catchError(error => {
                    done++;
                    progress.addWorkDone(1);
                    progress.subTitle = '' + done + '/' + toRetrieve.length;
                    this.injector.get(ErrorService).addNetworkError(error, 'errors.stores.get_track', []);
                    return of(null);
                  })
                ));
                operations$ = operations$.pipe(
                  switchMap(() => (requests.length === 0 ? of([]) : zip(requests)).pipe(
                    switchMap(responses => this.updatesFromServer(db, responses.filter(t => !!t), []))
                  ))
                );
              }
            }
            return operations$;
          }),
          catchError(error => {
            // should never happen
            Console.error('error getting track updates from server', error);
            return of(false);
          })
        );
      })
    );
  }

  private syncUpdatesToServer(db: Dexie): Observable<any> {
    return from(this.fullTrackTable!.where('updatedLocally').equals(1).limit(50).toArray()).pipe(
      switchMap(items => {
        if (this.db !== db) return EMPTY;
        if (items.length === 0) return of(true);
        Console.info('' + items.length + ' tracks to be updated on server');
        const limiter = new RequestLimiter(2);
        const requests: Observable<TrackDto>[] = [];
        items.forEach(item => {
          const request = () => {
            if (this.db !== db) return EMPTY;
            return this.injector.get(HttpService).put<TrackDto>(environment.apiBaseUrl + '/track/v1', item.track).pipe(
              catchError(e => {
                Console.error('error sending update for track', item.track, e);
                this.injector.get(ErrorService).addNetworkError(e, 'errors.stores.update_track', []);
                return EMPTY;
              })
            );
          }
          requests.push(limiter.add(request));
        });
        return (requests.length === 0 ? of([]) : zip(requests)).pipe(
          switchMap(responses => this.updatesFromServer(db, responses, [])),
          defaultIfEmpty(false),
        );
      }),
      catchError(error => {
        // should never happen
        Console.error('error sending tracks updates', error);
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
          this.fullTracks.get(key)?.newValue(null);
          this.simplifiedTracks.get(key)?.newValue(null);
          this.metadata.get(key)?.newValue(null);
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
        if (this.db !== db) return;
        const prefs = this.injector.get(PreferencesService);
        const entities = tracks.map(track => new Track(track, prefs));
        entities.forEach(entity => {
          this.fullTracks.get(entity.uuid + '#' + entity.owner)?.newValue(entity);
        })
        const simplified = entities.map(track => ({...this.simplify(track), key: track.uuid + '#' + track.owner}));
        if (this.db !== db) return;
        await this.simplifiedTrackTable!.bulkPut(simplified);
        if (this.db !== db) return;
        simplified.forEach(s => this.simplifiedTracks.get(s.key)?.newValue(s));
        const metadata = entities.map(track => ({...this.toMetadata(track), key: track.uuid + '#' + track.owner}));
        if (this.db !== db) return;
        await this.metadataTable!.bulkPut(metadata);
        if (this.db !== db) return;
        metadata.forEach(m => this.metadata.get(m.key)?.newValue(m));
      }
    })).pipe(
      defaultIfEmpty(true),
      catchError(error => {
        Console.error('Error saving tracks in database', error);
        this.injector.get(ErrorService).addTechnicalError(error, 'errors.stores.save_tracks', []);
        return of(true);
      })
    );
  }

  private hasLocalChanges(): Observable<boolean> {
    return from(this.fullTrackTable!.where('needsSync').equals(1).first()).pipe(
      map(result => !!result)
    );
  }

}

class TrackSyncStatus implements StoreSyncStatus {

  hasLocalChanges = false;
  inProgress = false;
  needsUpdateFromServer = true;
  lastUpdateFromServer?: number;

  get needsSync(): boolean {
    return this.hasLocalChanges || this.needsUpdateFromServer;
  }

}
