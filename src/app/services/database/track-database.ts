import { BehaviorSubject, EMPTY, Observable, Subscription, catchError, combineLatest, concat, defaultIfEmpty, distinctUntilChanged, first, from, map, of, switchMap, tap, zip } from "rxjs";
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
import { Progress, ProgressService } from '../progress/progress.service';
import { I18nService } from '../i18n/i18n.service';
import { CompositeOnDone } from 'src/app/utils/callback-utils';
import { ErrorService } from '../progress/error.service';
import { Console } from 'src/app/utils/console';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { QuotaService } from '../auth/quota.service';
import { StoreErrors } from './store-errors';
import { StoreOperations } from './store-operations';

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
  track?: TrackDto;
}

export class TrackDatabase {

  constructor(
    private readonly injector: Injector,
  ) {
    this.ngZone = injector.get(NgZone);
    this.subjectService = injector.get(DatabaseSubjectService);
    this.quotaService = injector.get(QuotaService);
    this._errors = new StoreErrors(injector, 'tracks', () => this.isQuotaReached());
    this.syncStatus$.pipe(map(s => !!s), distinctUntilChanged()).subscribe(loaded => this.loaded$.next(loaded));
    this.operations = new StoreOperations(
      'tracks',
      this.loaded$,
      this.syncStatus$,
      this.ngZone
    );
    injector.get(DatabaseService).registerStore({
      name: 'tracks',
      status$: this.syncStatus$,
      loaded$: this.loaded$,
      hasPendingOperations$: this.operations.hasPendingOperations$,
      fireSyncStatus: () => this.syncStatus$.next(this.syncStatus$.value),
      syncFromServer: () => this.triggerSyncFromServer(),
      doSync: () => this.sync(),
      resetErrors: () => this._errors.reset(),
    });
    injector.get(AuthService).auth$.subscribe(
      auth => {
        if (!auth) this.close();
        else this.open(auth.email);
      }
    );
  }

  private readonly subjectService: DatabaseSubjectService;
  private readonly quotaService: QuotaService;
  private db?: Dexie;
  private openEmail?: string;
  private preferencesSubscription?: Subscription;
  private databaseServiceSubscription?: Subscription;
  private readonly ngZone: NgZone;
  private readonly syncStatus$ = new BehaviorSubject<TrackSyncStatus | null>(null);
  private readonly _errors: StoreErrors;
  private readonly operations: StoreOperations;
  private readonly loaded$ = new BehaviorSubject<boolean>(false);

  private isQuotaReached(): boolean {
    const q = this.quotaService.quotas;
    return !q || q.tracksUsed >= q.tracksMax || q.tracksSizeUsed >= q.tracksSizeMax;
  }

  private close() {
    this.ngZone.runOutsideAngular(() => {
      if (this.db) {
        Console.info('Close track DB')
        this.operations.reset();
        this.db.close();
        this.openEmail = undefined;
        this.db = undefined;
        this.syncStatus$.next(null);
        this.preferencesSubscription?.unsubscribe();
        this.preferencesSubscription = undefined;
        this.databaseServiceSubscription?.unsubscribe();
        this.databaseServiceSubscription = undefined;
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
      schemaV1['full_tracks'] = 'key, version, updatedLocally, owner';
      db.version(1).stores(schemaV1);
      this.metadataTable = db.table<MetadataItem, string>('metadata');
      this.simplifiedTrackTable = db.table<SimplifiedTrackItem, string>('simplified_tracks');
      this.fullTrackTable = db.table<TrackItem, string>('full_tracks');
      this.db = db;
      let init = false;
      this.databaseServiceSubscription = this.injector.get(DatabaseService).db$.subscribe(
        versionedDb => {
          if (init || !versionedDb) return;
          init = true;
          this.initStatus();
          const currentVersion = versionedDb.tablesVersion['tracks'];
          let promise$ = Promise.resolve();
          if (!currentVersion || currentVersion < 1705) {
            promise$ = promise$.then(() => this.recomputeMetadata(true, false)).then(() => this.injector.get(DatabaseService).saveTableVersion('tracks', 1705));
          }
          promise$.then(() => {
            this.listenPreferences();
          });
        }
      );
    });
  }

  private initStatus(): void {
    const status = new TrackSyncStatus();
    const db = this.db;
    zip([
      from(this.fullTrackTable!.where('version').equals(0).limit(1).toArray()),
      from(this.fullTrackTable!.where('version').below(0).limit(1).toArray()),
      from(this.fullTrackTable!.where('updatedLocally').equals(1).limit(1).toArray())
    ])
    .pipe(first())
    .subscribe(([r1, r2, r3]) => {
      if (this.db === db) {
        status.hasLocalCreates = r1.length > 0;
        status.hasLocalDeletes = r2.length > 0;
        status.hasLocalUpdates = r3.length > 0;
        this.syncStatus$.next(status);
      }
    });
  }

  private listenPreferences(): void {
    let previousBaseSpeed: number | undefined = undefined;
    let previousBreakDuration: number | undefined = undefined;
    let previousBreakDistance: number | undefined = undefined;
    this.preferencesSubscription = this.injector.get(PreferencesService).preferences$.pipe(
      debounceTimeExtended(0, 5000),
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
          this.recomputeMetadata(speedChanged, breaksChanged);
        }
      }
    );
  }

  public recomputeMetadata(updateTimeEstimation: boolean, updateBreakTime: boolean): Promise<any> {
    if (!this.db || !this.metadataTable || !this.fullTrackTable) return Promise.resolve();
    Console.info('Preferences changed, recompute estimated time/breaks duration of trails', updateTimeEstimation, updateBreakTime);
    return this.operations.push('Update trails metadata', () => {
      let count = 0;
      let countInMemory = 0;
      let workAmount = 1000;
      const progress = this.injector.get(ProgressService).create(this.injector.get(I18nService).texts.recompute_metadata, workAmount);
      return this.db!.transaction('rw', [this.fullTrackTable!, this.metadataTable!], () => {
        return this.metadataTable?.count()
        .then(countFromTable => {
          const step = countFromTable > 0 ? workAmount * 1.0 / countFromTable : workAmount;
          return this.fullTrackTable?.each(trackItem => {
            if (!trackItem.track || trackItem.version === -1) return;
            count++;
            const track = new Track(trackItem.track, this.injector.get(PreferencesService));
            let meta$ = this.metadata.get(trackItem.key);
            if (meta$?.loadedValue) {
              countInMemory++;
              const meta = meta$.loadedValue;
              if (updateTimeEstimation) meta.estimatedDuration = track.computedMetadata.estimatedDurationSnapshot();
              if (updateBreakTime) meta.breaksDuration = track.computedMetadata.breakDurationSnapshot();
              meta$.newValue({...meta});
              this.metadataTable?.put({
                key: trackItem.key,
                ...meta
              });
            } else {
              this.metadataTable?.put({
                key: trackItem.key,
                ...TrackDatabase.toMetadata(track)
              });
            };
            progress.addWorkDone(Math.min(workAmount, step));
            workAmount -= step;
          });
        });
      })
      .then(() => {
        Console.info('Trails metadata updated', count, 'including items in memory', countInMemory);
        progress.done();
      })
      .catch(e => {
        Console.error('Error updating tracks metadata', e);
        progress.done();
      });
    });
  }

  public cleanDatabase(db: Dexie, email: string): Observable<any> {
    // remove all tracks not linked by any trail
    return this.injector.get(TrailService).getAll$().pipe(
      switchMap(trails$ => trails$.length === 0 ? of([]) : combineLatest(trails$)),
      first(),
      switchMap(trails => {
        const dbService = this.injector.get(DatabaseService);
        if (db !== dbService.db?.db || email !== dbService.email) return of(false);
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
            if (db !== dbService.db?.db || email !== dbService.email) return [];
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
            if (db !== dbService.db?.db || email !== dbService.email) return false;
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
      item$ = this.subjectService.create<TrackMetadataSnapshot>('TrackMetadataSnapshot', () => this.loadMetadata(key));
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
      this.ngZone.runOutsideAngular(() => this.metadataLoadingTimeout ??= setTimeout(() => this.loadMetadataAsync(), 0));
    });
  }
  private loadMetadataAsync(): void {
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
              item$ = this.subjectService.create<TrackMetadataSnapshot>('TrackMetadataSnapshot', () => this.loadMetadata(key), undefined, item);
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
      item$ = this.subjectService.create<SimplifiedTrackSnapshot>('SimplifiedTrackSnapshot', () => this.loadSimplifiedTrack(key));
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
      this.ngZone.runOutsideAngular(() => this.simplifiedLoadingTimeout ??= setTimeout(() => this.loadSimplifiedTrackAsync(), 0));
    });
  }
  private loadSimplifiedTrackAsync(): void {
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
    });
  }

  private fullTrackTable?: Table<TrackItem, string>;
  private readonly fullTracks = new Map<string, DatabaseSubject<Track>>();

  public getFullTrack$(uuid: string, owner: string): Observable<Track | null> {
    const key = uuid + '#' + owner;
    let item$ = this.fullTracks.get(key);
    if (!item$) {
      item$ = this.subjectService.create<Track>('Track', () => this.loadFullTrack(key));
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

  public static simplify(track: Track): SimplifiedTrackSnapshot {
    const simplified: SimplifiedTrackSnapshot = { points: [] };
    let previous: L.LatLng | undefined;
    track.forEachPoint(point => {
      const p = point.pos;
      if (!previous || p.distanceTo(previous) >= 25) {
        const newPoint: SimplifiedPoint = {
          lat: p.lat,
          lng: p.lng,
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
            return;
          }
        }
        simplified.points.push(newPoint);
        previous = p;
      }
    });
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

  public static toMetadata(track: Track): TrackMetadataSnapshot {
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
      const simplified = TrackDatabase.simplify(track);
      const metadata = TrackDatabase.toMetadata(track);
      const stepsDone = new CompositeOnDone(ondone);
      const onDbDone = stepsDone.add();
      this.operations.push('Create track', () => {
        if (!this.db) return Promise.reject();
        const tx = this.db.transaction('rw', [this.metadataTable!, this.simplifiedTrackTable!, this.fullTrackTable!], () => {
          const promise1 = this.fullTrackTable?.add({
            key,
            uuid: dto.uuid,
            owner: dto.owner,
            version: dto.version,
            updatedLocally: 0,
            track: dto,
          });
          const promise2 = this.simplifiedTrackTable?.add({
            ...simplified,
            key,
          });
          const promise3 = this.metadataTable?.add({
            ...metadata,
            key,
          });
          return Promise.all([promise1, promise2, promise3])
          .catch(e => {
            Console.error("Error storing track in database", e);
            return Promise.resolve();
          });
        });
        const full$ = this.fullTracks.get(key);
        if (full$) full$.newValue(track);
        else this.fullTracks.set(key, this.subjectService.create<Track>('Track', () => this.loadFullTrack(key), undefined, track));
        const simplified$ = this.simplifiedTracks.get(key);
        if (simplified$) simplified$.newValue(simplified);
        else this.simplifiedTracks.set(key, this.subjectService.create<SimplifiedTrackSnapshot>('SimplifiedTrackSnapshot', () => this.loadSimplifiedTrack(key), undefined, simplified));
        const metadata$ = this.metadata.get(key);
        if (metadata$) metadata$.newValue(metadata);
        else this.metadata.set(key, this.subjectService.create<TrackMetadataSnapshot>('TrackMetadataSnapshot', () => this.loadMetadata(key), undefined, metadata));
        const onDone4 = stepsDone.add();
        stepsDone.start();
        onDone4();
        return tx.then(() => {
          this.syncStatus$.value!.hasLocalCreates = true;
          this.syncStatus$.next(this.syncStatus$.value);
          onDbDone();
        });
      });
    });
  }

  public update(track: Track): void {
    this.ngZone.runOutsideAngular(() => {
      const key = track.uuid + '#' + track.owner;
      track.updatedAt = Date.now();
      const dto = track.toDto();
      const simplified = TrackDatabase.simplify(track);
      const metadata = TrackDatabase.toMetadata(track);
      this.operations.push('Update track', () => {
        if (!this.db) return Promise.reject();
        const tx = this.db.transaction('rw', [this.metadataTable!, this.simplifiedTrackTable!, this.fullTrackTable!], () => {
          const promise1 = this.fullTrackTable?.put({
            key,
            uuid: dto.uuid,
            owner: dto.owner,
            version: dto.version,
            updatedLocally: 1,
            track: dto,
          });
          const promise2 = this.simplifiedTrackTable?.put({
            ...simplified,
            key,
          });
          const promise3 = this.metadataTable?.put({
            ...metadata,
            key,
          });
          return Promise.all([promise1, promise2, promise3])
          .catch(e => {
            Console.error("Error updating track in database", e);
            return Promise.resolve();
          });
        });
        const full$ = this.fullTracks.get(key);
        if (full$) full$.newValue(track);
        else this.fullTracks.set(key, this.subjectService.create<Track>('Track', () => this.loadFullTrack(key), undefined, track));
        const simplified$ = this.simplifiedTracks.get(key);
        if (simplified$) simplified$.newValue(simplified);
        else this.simplifiedTracks.set(key, this.subjectService.create<SimplifiedTrackSnapshot>('SimplifiedTrackSnapshot', () => this.loadSimplifiedTrack(key), undefined, simplified));
        const metadata$ = this.metadata.get(key);
        if (metadata$) metadata$.newValue(metadata);
        else this.metadata.set(key, this.subjectService.create<TrackMetadataSnapshot>('TrackMetadataSnapshot', () => this.loadMetadata(key), undefined, metadata));
        return tx.then(() => {
          this.syncStatus$.value!.hasLocalUpdates = true;
          this.syncStatus$.next(this.syncStatus$.value);
        });
      });
    });
  }

  public delete(uuid: string, owner: string, ondone?: () => void): void {
    this.ngZone.runOutsideAngular(() => {
      this.operations.push('Delete track', () => {
        const key = uuid + '#' + owner;
        let dbUpdated: PromiseExtended<void> | Promise<void> | undefined = this.db?.transaction('rw', [this.metadataTable!, this.simplifiedTrackTable!, this.fullTrackTable!], async tx => {
          await this.fullTrackTable?.put({
            key,
            uuid: uuid,
            owner: owner,
            version: -1,
            updatedLocally: 0,
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
        dbUpdated ??= Promise.resolve();
        return dbUpdated.then(() => {
          this.syncStatus$.value!.hasLocalDeletes = true;
          this.syncStatus$.next(this.syncStatus$.value);
          if (ondone) ondone();
        });
      });
    });
  }

  public deleteMany(ids: {uuid: string, owner: string}[], progress: Progress | undefined, progressWork: number, ondone?: () => void): void {
    this.ngZone.runOutsideAngular(() => {
      this.operations.push('Delete multiple tracks', () => {
        const keys = ids.map(id => id.uuid + '#' + id.owner);
        let dbUpdated: PromiseExtended<void> | Promise<void> | undefined = this.db?.transaction('rw', [this.metadataTable!, this.simplifiedTrackTable!, this.fullTrackTable!], async tx => {
          await this.fullTrackTable?.bulkPut(ids.map(id => ({
            key: id.uuid + '#' + id.owner,
            uuid: id.uuid,
            owner: id.owner,
            version: -1,
            updatedLocally: 0,
            track: undefined,
          })));
          await this.simplifiedTrackTable?.bulkDelete(keys);
          await this.metadataTable?.bulkDelete(keys);
        });
        const progressDb = progressWork / 3;
        let progress2 = progressWork - progressDb;
        let remaining = keys.length;
        for (const key of keys) {
          const full$ = this.fullTracks.get(key);
          if (full$) full$.newValue(null);
          const simplified$ = this.simplifiedTracks.get(key);
          if (simplified$) simplified$.newValue(null);
          const metadata$ = this.metadata.get(key);
          if (metadata$) metadata$.newValue(null);
          let work = progress2 / remaining;
          progress2 -= work;
          remaining--;
          progress?.addWorkDone(work);
        }
        dbUpdated ??= Promise.resolve();
        return dbUpdated.then(() => {
          progress?.addWorkDone(progressDb);
          this.syncStatus$.value!.hasLocalDeletes = true;
          this.syncStatus$.next(this.syncStatus$.value);
          if (ondone) ondone();
        });
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

  private sync(): Observable<boolean> {
    if (!this.db) return EMPTY;
    const db = this.db;
    return this.operations.requestSync(() => this.db === db ? this.doSync() : EMPTY);
  }

  private doSync(): Observable<boolean> {
    return this.ngZone.runOutsideAngular(() => {
      const db = this.db!;
      this.syncStatus$.value!.inProgress = true;
      this.syncStatus$.next(this.syncStatus$.value);
      Console.info("Store tracks sync start: ", this.syncStatus$.value, this.operations.pendingOperations);
      const nextStep = (previousComplete: boolean, nextOp: (db: Dexie) => Observable<boolean>) => {
        if (this.db !== db) return EMPTY;
        if (!previousComplete || this.operations.pendingOperations > 0) return of(false);
        return nextOp(db);
      };
      return this.syncCreatedLocally(db).pipe(
        switchMap(r => nextStep(r, db => this.syncDeletedLocally(db))),
        switchMap(r => nextStep(r, db => this.syncUpdatesFromServer(db))),
        switchMap(r => nextStep(r, db => this.syncUpdatesToServer(db))),
        switchMap(r => this.db === db ? this.getLocalChanges().pipe(map(l => ([l, r] as [{create: boolean, update: boolean, delete: boolean}, boolean]))) : EMPTY),
        map(([hasLocalChanges, syncComplete]) => {
          if (this.db !== db) return false;
          const status = this.syncStatus$.value!;
          status.hasLocalCreates = hasLocalChanges.create;
          status.hasLocalUpdates = hasLocalChanges.update;
          status.hasLocalDeletes = hasLocalChanges.delete;
          status.quotaReached = this.isQuotaReached();
          status.inProgress = false;
          status.needsUpdateFromServer = !syncComplete;
          status.lastUpdateFromServer = syncComplete ? Date.now() : 0;
          Console.info("Store tracks sync done: ", status, this.operations.pendingOperations);
          this.syncStatus$.next(status);
          return !syncComplete;
        })
      );
    });
  }

  private syncCreatedLocally(db: Dexie): Observable<boolean> {
    return from(this.fullTrackTable!.where('version').equals(0).limit(50).toArray()).pipe(
      switchMap(items => {
        if (this.db !== db) return EMPTY;
        const toCreate = items.filter(item => this._errors.canProcess(item.uuid + '#' + item.owner, true));
        if (toCreate.length === 0) return of(true);
        Console.info('' + toCreate.length + ' tracks to be created on server');
        const limiter = new RequestLimiter(2);
        const requests: Observable<any>[] = [];
        toCreate.forEach(item => {
          const request = this.createItemRequest(db, item);
          requests.push(limiter.add(request));
        });
        if (requests.length === 0) return of(true);
        return zip(requests).pipe(map(() => items.length < 50), defaultIfEmpty(true));
      }),
      catchError(error => {
        // should not happen
        Console.error('error creating tracks on server', error);
        return of(true);
      })
    );
  }
  private createItemRequest(db: Dexie, item: TrackItem): () => Observable<any> {
    return () => {
      if (this.db !== db) return EMPTY;
      return this.injector.get(HttpService).post<TrackDto>(environment.apiBaseUrl + '/track/v1', item.track).pipe(
        switchMap(result => {
          if (this.db !== db) return EMPTY;
          Console.info("track created on server", result.uuid);
          this._errors.itemSuccess(item.uuid + '#' + item.owner);
          this.quotaService.updateQuotas(q => {
            q.tracksUsed++;
            q.tracksSizeUsed += result.sizeUsed ?? 0;
          });
          return from(this.fullTrackTable!.put({
            key: result.uuid + '#' + result.owner,
            uuid: result.uuid,
            owner: result.owner,
            version: result.version,
            updatedLocally: 0,
            track: result,
          }));
        }),
        catchError(e => {
          Console.error('error creating track on server', item.track, e);
          this.injector.get(ErrorService).addNetworkError(e, 'errors.stores.save_track', []);
          this._errors.itemError(item.uuid + '#' + item.owner, e);
          return EMPTY;
        })
      );
    };
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
          switchMap(() => {
            if (this.db !== db) return EMPTY;
            this.quotaService.updateQuotas(q => {
              q.tracksUsed -= uuids.length;
              q.tracksSizeUsed -= items.filter(item => item.owner === this.openEmail).reduce((p,n) => p + (n.track?.sizeUsed ?? 0), 0);
            });
            return from(this.fullTrackTable!.bulkDelete(keys)).pipe(map(() => uuids.length < 50));
          }),
          catchError(error => {
            this.injector.get(ErrorService).addNetworkError(error, 'errors.stores.delete_tracks', []);
            Console.error('Error deleting tracks from the server', error);
            return of(true);
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
                    Console.error('Error retrieving tracks', error);
                    return of(null);
                  })
                ));
                operations$ = operations$.pipe(
                  switchMap(() => (requests.length === 0 ? of([]) : zip(requests)).pipe(
                    switchMap(responses => this.updatesFromServer(db, responses.filter(t => !!t), [])),
                    map(() => true),
                  ))
                );
              }
            }
            return operations$;
          }),
          catchError(error => {
            // should never happen
            Console.error('error getting track updates from server', error);
            return of(true);
          })
        );
      })
    );
  }

  private syncUpdatesToServer(db: Dexie): Observable<boolean> {
    return from(this.fullTrackTable!.where('updatedLocally').equals(1).limit(50).toArray()).pipe(
      switchMap(items => {
        if (this.db !== db) return EMPTY;
        const toUpdate = items.filter(item => this._errors.canProcess(item.uuid + '#' + item.owner, false));
        if (toUpdate.length === 0) return of(true);
        Console.info('' + toUpdate.length + ' tracks to be updated on server');
        const limiter = new RequestLimiter(2);
        const requests: Observable<TrackDto>[] = [];
        toUpdate.forEach(item => {
          const request = () => {
            if (this.db !== db) return EMPTY;
            return this.injector.get(HttpService).put<TrackDto>(environment.apiBaseUrl + '/track/v1', item.track).pipe(
              map(r => {
                this._errors.itemSuccess(item.uuid + '#' + item.owner);
                return r;
              }),
              catchError(e => {
                Console.error('error sending update for track', item.track, e);
                this.injector.get(ErrorService).addNetworkError(e, 'errors.stores.update_track', []);
                this._errors.itemError(item.uuid + '#' + item.owner, e);
                return EMPTY;
              })
            );
          }
          requests.push(limiter.add(request));
        });
        return (requests.length === 0 ? of([]) : zip(requests)).pipe(
          switchMap(responses => this.updatesFromServer(db, responses, [])),
          map(() => items.length < 50),
          defaultIfEmpty(true),
        );
      }),
      catchError(error => {
        // should never happen
        Console.error('error sending tracks updates', error);
        return of(true);
      })
    );
  }

  private updatesFromServer(db: Dexie, tracks: TrackDto[], deleted: { uuid: string, owner: string }[]): Observable<any> {
    if (this.db !== db) return EMPTY;
    if (tracks.length === 0 && deleted.length === 0) return of(true);
    tracks.forEach(t => this._errors.itemSuccess(t.uuid + '#' + t.owner));
    deleted.forEach(t => this._errors.itemSuccess(t.uuid + '#' + t.owner));
    return from(this.db?.transaction('rw', [this.metadataTable!, this.simplifiedTrackTable!, this.fullTrackTable!], async tx => { // NOSONAR
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
          track: track,
        }));
        await this.fullTrackTable!.bulkPut(fulls);
        if (this.db !== db) return;
        const prefs = this.injector.get(PreferencesService);
        const entities = tracks.map(track => new Track(track, prefs));
        entities.forEach(entity => {
          this.fullTracks.get(entity.uuid + '#' + entity.owner)?.newValue(entity);
        })
        const simplified = entities.map(track => ({...TrackDatabase.simplify(track), key: track.uuid + '#' + track.owner}));
        if (this.db !== db) return;
        await this.simplifiedTrackTable!.bulkPut(simplified);
        if (this.db !== db) return;
        simplified.forEach(s => this.simplifiedTracks.get(s.key)?.newValue(s));
        const metadata = entities.map(track => ({...TrackDatabase.toMetadata(track), key: track.uuid + '#' + track.owner}));
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

  private getLocalChanges(): Observable<{create: boolean, update: boolean, delete: boolean}> {
    return zip([
      from(this.fullTrackTable!.where('version').equals(0).limit(1).toArray()),
      from(this.fullTrackTable!.where('version').below(0).limit(1).toArray()),
      from(this.fullTrackTable!.where('updatedLocally').equals(1).limit(1).toArray())
    ])
    .pipe(
      first(),
      map(([r1, r2, r3]) => ({create: r1.length > 0, delete: r2.length > 0, update: r3.length > 0}))
    );
  }

}

class TrackSyncStatus implements StoreSyncStatus {

  hasLocalCreates = false;
  hasLocalUpdates = false;
  hasLocalDeletes = false;
  inProgress = false;
  needsUpdateFromServer = true;
  lastUpdateFromServer?: number;
  quotaReached = false;

  get hasLocalChanges(): boolean {
    return this.hasLocalCreates || this.hasLocalUpdates || this.hasLocalDeletes;
  }

  get needsSync(): boolean {
    return (this.hasLocalCreates && !this.quotaReached) || this.hasLocalUpdates || this.hasLocalDeletes || this.needsUpdateFromServer;
  }

}
