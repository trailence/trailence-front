import { BehaviorSubject, EMPTY, Observable, Subscription, catchError, combineLatest, concat, debounceTime, defaultIfEmpty, first, firstValueFrom, forkJoin, from, map, of, switchMap, tap, throwError, zip } from "rxjs";
import { TrackDto } from "src/app/model/dto/track";
import { Track } from "src/app/model/track";
import { StoreLoadStatus, StoreSyncStatus } from "./store/store";
import { RequestLimiter } from "src/app/utils/request-limiter";
import { environment } from "src/environments/environment";
import { HttpService } from "../http/http.service";
import { UpdatesResponse } from "./store/owned-store";
import { Injector, NgZone } from "@angular/core";
import { TrailService } from './trail.service';
import { TrackService } from './track.service';
import { PreferencesService } from '../preferences/preferences.service';
import { DatabaseSubject } from './database-subject';
import { DatabaseSubjectService } from './database-subject-service';
import { Progress, ProgressService } from '../progress/progress.service';
import { I18nService } from '../i18n/i18n.service';
import { ErrorService } from '../progress/error.service';
import { Console } from 'src/app/utils/console';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { QuotaService } from '../auth/quota.service';
import { StoreErrors } from './store/store-errors';
import { StoreOperations } from './store/store-operations';
import { SimplifiedTrackSnapshot, TrackMetadataSnapshot } from 'src/app/model/snapshots';
import { StoreService, StoreWithCleaning } from './store/store.service';
import { DbTable, DbTableWhereEquals, DbTableWhereGreaterThan, DbTableWhereLessThan } from './storage/db-table';
import { Db, DbReady } from './storage/db';
import { OfflineMapService } from '../map/offline-map.service';
import { WorkerService } from 'src/app/worker/web-app';

interface MetadataItem extends TrackMetadataSnapshot {
  key: string;
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

export class TrackDatabase implements StoreWithCleaning {

  constructor(
    private readonly injector: Injector,
  ) {
    this.ngZone = injector.get(NgZone);
    this.subjectService = injector.get(DatabaseSubjectService);
    this.quotaService = injector.get(QuotaService);
    this._errors = new StoreErrors(injector, 'tracks', () => this.isQuotaReached());
    this.operations = new StoreOperations(
      'tracks',
      this.loaded$,
      this.syncStatus$,
      this.ngZone
    );
    injector.get(StoreService).registerStore({
      name: 'tracks',
      store: this,
      status$: this.syncStatus$,
      loadStatus$: this.loaded$,
      hasPendingOperations$: this.operations.hasPendingOperations$,
      fireSyncStatus: () => this.syncStatus$.next(this.syncStatus$.value),
      syncFromServer: () => this.triggerSyncFromServer(),
      doSync: () => this.sync(),
      resetErrors: () => this._errors.reset(),
      hardDelete: () => this.hardDelete(),
    });
    this.tableMeta = new DbTable<MetadataItem>(injector, 'metadata', 'key', 'key');
    this.tableSimplifiedTrack = new DbTable<SimplifiedTrackItem>(injector, 'simplified_tracks', 'key', 'key');
    this.tableFullTrack = new DbTable<TrackItem>(injector, 'full_tracks', 'key, version, updatedLocally, owner', 'key');
    this.tableFullTrack.backupLinesBunch = 2;
    this.tableFullTrack.triggerBackupOperator = debounceTime(15000);
    // TODO may be full track table backup should support diff and one file by line ?
    this.database = new Db(injector, 'trailence_tracks', true, [this.tableMeta, this.tableSimplifiedTrack, this.tableFullTrack]);
    this.database.dbReady$.subscribe(ready => {
      if (ready) this.load(ready);
      else this.unload();
    });
    this.database.start();
  }

  private readonly database: Db;
  private readonly tableMeta: DbTable<MetadataItem>;
  private readonly tableSimplifiedTrack: DbTable<SimplifiedTrackItem>;
  private readonly tableFullTrack: DbTable<TrackItem>;
  private readonly subjectService: DatabaseSubjectService;
  private readonly quotaService: QuotaService;
  private preferencesSubscription?: Subscription;
  private readonly ngZone: NgZone;
  private readonly syncStatus$ = new BehaviorSubject<TrackSyncStatus | null>(null);
  private readonly _errors: StoreErrors;
  private readonly operations: StoreOperations;
  private readonly loaded$ = new BehaviorSubject<StoreLoadStatus | undefined>(undefined);

  private isQuotaReached(): boolean {
    const q = this.quotaService.quotas;
    return !q || q.tracksUsed >= q.tracksMax || q.tracksSizeUsed >= q.tracksSizeMax;
  }

  public get isLoaded$() { return this.loaded$.pipe(map(l => !!l)); }

  private unload() {
    this.loaded$.next(undefined);
    this.operations.reset();
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

  private _loading?: DbReady;
  private load(ready: DbReady): void {
    this._loading = ready;
    this.initStatus(ready).subscribe(() => {
      if (this._loading === ready)
        this._loading = undefined;
      this.listenPreferences();
    });
  }

  private initStatus(ready: DbReady): Observable<any> {
    const status = new TrackSyncStatus();
    return zip([
      this.tableFullTrack.keysWhere$(new DbTableWhereEquals('version', 0), 1),
      this.tableFullTrack.keysWhere$(new DbTableWhereLessThan('version', 0), 1),
      this.tableFullTrack.keysWhere$(new DbTableWhereEquals('updatedLocally', 1), 1),
    ])
    .pipe(
      first(),
      map(([r1, r2, r3]) => {
        if (this._loading !== ready) return false;
        status.hasLocalCreates = r1.length > 0;
        status.hasLocalDeletes = r2.length > 0;
        status.hasLocalUpdates = r3.length > 0;
        this.syncStatus$.next(status);
        this.loaded$.next({counter: ready.counter, email: ready.email!});
        return true;
      }),
    );
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
    Console.info('Preferences changed, recompute estimated time/breaks duration of trails', updateTimeEstimation, updateBreakTime);
    return this.operations.push('Update trails metadata', () => {
      let count = 0;
      let countInMemory = 0;
      let workAmount = 1000;
      const progress = this.injector.get(ProgressService).create(this.injector.get(I18nService).texts.recompute_metadata, workAmount);
      if (!this.loaded$.value) return Promise.resolve();
      return this.database.transaction$(false, [this.tableFullTrack.name, this.tableMeta.name], () => {
        return firstValueFrom(this.tableMeta.count$().pipe(
          switchMap(countFromTable => {
            const step = countFromTable > 0 ? workAmount / countFromTable : workAmount;
            return this.tableFullTrack.forEach$(trackItem => {
              if (!trackItem.track || trackItem.version === -1) return;
              count++;
              const track = new Track(trackItem.track, this.injector.get(PreferencesService), this.injector.get(OfflineMapService));
              let meta$ = this.metadata.get(trackItem.key);
              if (meta$?.loadedValue) {
                countInMemory++;
                const meta = meta$.loadedValue;
                if (updateTimeEstimation) meta.estimatedDuration = track.computedMetadata.estimatedDurationSnapshot();
                if (updateBreakTime) meta.breaksDuration = track.computedMetadata.breakDurationSnapshot();
                meta$.newValue({...meta});
                this.tableMeta.setOne$({
                  key: trackItem.key,
                  ...meta
                }).subscribe();
              } else {
                this.tableMeta.setOne$({
                  key: trackItem.key,
                  ...TrackDatabase.toMetadata(track)
                }).subscribe();
              };
              progress.addWorkDone(Math.min(workAmount, step));
              workAmount -= step;
            });
          }),
        ));
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

  cleaningDependencies(): string[] {
    return ['trails'];
  }

  doCleaning(): Observable<any> {
    // remove all tracks not linked by any trail
    const status = this.loaded$.value;
    if (!status) return of(false);
    return this.injector.get(TrailService).getAll$().pipe(
      switchMap(trails$ => trails$.length === 0 ? of([]) : combineLatest(trails$)),
      first(),
      switchMap(trails => {
        if (status.counter !== this.loaded$.value?.counter) return of(false);
        const allKnownKeys: string[] = [];
        for (const trail of trails) {
          if (trail) {
            allKnownKeys.push(trail.originalTrackUuid + '#' + trail.owner);
            if (trail.currentTrackUuid !== trail.originalTrackUuid)
              allKnownKeys.push(trail.currentTrackUuid + '#' + trail.owner);
          }
        }
        return this.tableMeta.getAllKeys$().pipe(
          map(keys => {
            if (status.counter !== this.loaded$.value?.counter) return [];
            const eligibleKeys: string[] = [];
            for (const key of keys) {
              if (!allKnownKeys.includes(key)) {
                eligibleKeys.push(key);
              }
            }
            return eligibleKeys;
          }),
          switchMap(keys => {
            if (keys.length === 0 || status.counter !== this.loaded$.value?.counter) return of([]);
            return this.tableMeta.getByKeys$(keys);
          }),
          map(items => {
            if (status.counter !== this.loaded$.value?.counter) return false;
            items = items.filter(i => i.localUpdate < Date.now() - 24 * 60 * 60 * 1000 && i.updatedAt < Date.now() - 24 * 60 * 60 * 1000);
            Console.info('Tracks cleanup: ' + items.length + ' to delete');
            for (const item of items) {
              this.injector.get(TrackService).deleteByUuidAndOwner(item.uuid, item.owner);
            }
            return true;
          })
        )
      })
    );
  }

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
    this.tableMeta.getByKeys$(keys).subscribe(items => {
      for (const entry of map.entries()) {
        const item = items.find(i => i.key === entry[0]);
        const callback = entry[1];
        callback(item || null);
      }
    });
  }

  public getAllMetadata$(): Observable<Observable<TrackMetadataSnapshot | null>[]> {
    return this.ngZone.runOutsideAngular(() => {
      return this.tableMeta.getAll$().pipe(
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
    this.tableSimplifiedTrack.getByKeys$(keys).subscribe(items => {
      for (const entry of map.entries()) {
        const item = items.find(i => i.key === entry[0]);
        const callback = entry[1];
        callback(item || null);
      }
    });
  }

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
    return firstValueFrom(this.tableFullTrack.getByKey$(key).pipe(
      map(item => {
        if (item?.track) return new Track(item.track, this.injector.get(PreferencesService), this.injector.get(OfflineMapService));
        return null;
      })
    ));
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
      const simplifiedTrack$ = this.injector.get(WorkerService).simplifyTrack(track);
      const metadata = TrackDatabase.toMetadata(track);
      const status = this.loaded$.value;
      if (!status) return;
      this.operations.push('Create track', () => {
        if (status.counter !== this.loaded$.value?.counter) return Promise.reject(new Error('track DB changed'));
        const tx = this.database.transaction$(false, [this.tableMeta.name, this.tableSimplifiedTrack.name, this.tableFullTrack.name], () =>
          firstValueFrom(forkJoin([
            this.tableFullTrack.addOne$({
              key,
              uuid: dto.uuid,
              owner: dto.owner,
              version: dto.version,
              updatedLocally: 0,
              track: dto,
            }),
            simplifiedTrack$.then(s => this.tableSimplifiedTrack.addOne$({
              ...s,
              key,
            })),
            this.tableMeta.addOne$({
              ...metadata,
              key,
            })
          ]).pipe(
            catchError(e => {
              Console.error('Error storing track in database', e);
              return throwError(() => e);
            })
          ))
        );
        const full$ = this.fullTracks.get(key);
        if (full$) full$.newValue(track);
        else this.fullTracks.set(key, this.subjectService.create<Track>('Track', () => this.loadFullTrack(key), undefined, track));
        simplifiedTrack$.then(simplified => {
          const simplified$ = this.simplifiedTracks.get(key);
          if (simplified$) simplified$.newValue(simplified);
          else this.simplifiedTracks.set(key, this.subjectService.create<SimplifiedTrackSnapshot>('SimplifiedTrackSnapshot', () => this.loadSimplifiedTrack(key), undefined, simplified));
        });
        const metadata$ = this.metadata.get(key);
        if (metadata$) metadata$.newValue(metadata);
        else this.metadata.set(key, this.subjectService.create<TrackMetadataSnapshot>('TrackMetadataSnapshot', () => this.loadMetadata(key), undefined, metadata));
        return tx.then(() => {
          this.syncStatus$.value!.hasLocalCreates = true;
          this.syncStatus$.next(this.syncStatus$.value);
          if (ondone) ondone();
        });
      });
    });
  }

  public update(track: Track): void {
    this.ngZone.runOutsideAngular(() => {
      const key = track.uuid + '#' + track.owner;
      track.updatedAt = Date.now();
      const dto = track.toDto();
      const simplifiedTrack$ = this.injector.get(WorkerService).simplifyTrack(track);
      const metadata = TrackDatabase.toMetadata(track);
      const status = this.loaded$.value;
      if (!status) return;
      this.operations.push('Update track', () => {
        if (status.counter !== this.loaded$.value?.counter) return Promise.reject(new Error('track DB changed'));
        const tx = this.database.transaction$(false, [this.tableMeta.name, this.tableSimplifiedTrack.name, this.tableFullTrack.name], () =>
          firstValueFrom(forkJoin([
            this.tableFullTrack.setOne$({
              key,
              uuid: dto.uuid,
              owner: dto.owner,
              version: dto.version,
              updatedLocally: 1,
              track: dto,
            }),
            simplifiedTrack$.then(simplified => this.tableSimplifiedTrack.setOne$({
              ...simplified,
              key,
            })),
            this.tableMeta.setOne$({
              ...metadata,
              key,
            }),
          ]).pipe(
            catchError(e => {
              Console.error('Error updating track in database', e);
              return throwError(() => e);
            })
          ))
        );
        const full$ = this.fullTracks.get(key);
        if (full$) full$.newValue(track);
        else this.fullTracks.set(key, this.subjectService.create<Track>('Track', () => this.loadFullTrack(key), undefined, track));
        simplifiedTrack$.then(simplified => {
          const simplified$ = this.simplifiedTracks.get(key);
          if (simplified$) simplified$.newValue(simplified);
          else this.simplifiedTracks.set(key, this.subjectService.create<SimplifiedTrackSnapshot>('SimplifiedTrackSnapshot', () => this.loadSimplifiedTrack(key), undefined, simplified));
        });
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
      const status = this.loaded$.value;
      if (!status) return;
      this.operations.push('Delete track', () => {
        if (status.counter !== this.loaded$.value?.counter) return Promise.reject(new Error('track DB changed'));
        const key = uuid + '#' + owner;
        const tx = this.database.transaction$(false, [this.tableMeta.name, this.tableSimplifiedTrack.name, this.tableFullTrack.name], () =>
          firstValueFrom(forkJoin([
            this.tableFullTrack.setOne$({
              key,
              uuid: uuid,
              owner: owner,
              version: -1,
              updatedLocally: 0,
              track: undefined,
            }),
            this.tableSimplifiedTrack.deleteOne$(key),
            this.tableMeta.deleteOne$(key),
          ]).pipe(
            catchError(e => {
              Console.error('Error deleting track in database', e);
              return throwError(() => e);
            })
          ))
        );
        const full$ = this.fullTracks.get(key);
        if (full$) full$.newValue(null);
        const simplified$ = this.simplifiedTracks.get(key);
        if (simplified$) simplified$.newValue(null);
        const metadata$ = this.metadata.get(key);
        if (metadata$) metadata$.newValue(null);
        return tx.then(() => {
          this.syncStatus$.value!.hasLocalDeletes = true;
          this.syncStatus$.next(this.syncStatus$.value);
          if (ondone) ondone();
        });
      });
    });
  }

  public deleteMany(ids: {uuid: string, owner: string}[], progress: Progress | undefined, progressWork: number, ondone?: () => void): void {
    this.ngZone.runOutsideAngular(() => {
      const status = this.loaded$.value;
      if (!status) return;
      this.operations.push('Delete multiple tracks', () => {
        if (status.counter !== this.loaded$.value?.counter) return Promise.reject(new Error('track DB changed'));
        const keys = ids.map(id => id.uuid + '#' + id.owner);
        const tx = this.database.transaction$(false, [this.tableMeta.name, this.tableSimplifiedTrack.name, this.tableFullTrack.name], () =>
          firstValueFrom(forkJoin([
            this.tableFullTrack.setMany$(ids.map(id => ({
              key: id.uuid + '#' + id.owner,
              uuid: id.uuid,
              owner: id.owner,
              version: -1,
              updatedLocally: 0,
              track: undefined,
            }))),
            this.tableSimplifiedTrack.deleteMany$(keys),
            this.tableMeta.deleteMany$(keys),
          ]).pipe(
            catchError(e => {
              Console.error('Error deleting tracks in database', e);
              return throwError(() => e);
            })
          ))
        );
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
        return tx.then(() => {
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
          if (!status) return of(false);
          return concat(
            of(false),
            this.tableFullTrack.getByKey$(key).pipe(
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
    const status = this.loaded$.value;
    if (!status) return EMPTY;
    return this.operations.requestSync(() => this.doSync(status));
  }

  private doSync(status: StoreLoadStatus): Observable<boolean> {
    return this.ngZone.runOutsideAngular(() => {
      if (status.counter !== this.loaded$.value?.counter) return EMPTY;
      this.syncStatus$.value!.inProgress = true;
      this.syncStatus$.next(this.syncStatus$.value);
      Console.info("Store tracks sync start: ", this.syncStatus$.value, this.operations.pendingOperations);
      const nextStep = (previousComplete: boolean, nextOp: () => Observable<boolean>) => {
        if (status.counter !== this.loaded$.value?.counter) return EMPTY;
        if (!previousComplete || this.operations.pendingOperations > 0) return of(false);
        return nextOp();
      };
      return this.syncCreatedLocally(status).pipe(
        switchMap(r => nextStep(r, () => this.syncDeletedLocally(status))),
        switchMap(r => nextStep(r, () => this.syncUpdatesFromServer(status))),
        switchMap(r => nextStep(r, () => this.syncUpdatesToServer(status))),
        switchMap(r => status.counter === this.loaded$.value?.counter ? this.getLocalChanges().pipe(map(l => ([l, r] as [{create: boolean, update: boolean, delete: boolean}, boolean]))) : EMPTY),
        defaultIfEmpty([undefined, false] as [{create: boolean, update: boolean, delete: boolean} | undefined, boolean]),
        map(([hasLocalChanges, syncComplete]) => {
          const sync = this.syncStatus$.value!;
          if (!hasLocalChanges || status.counter !== this.loaded$.value?.counter) {
            sync.inProgress = false;
            this.syncStatus$.next(sync);
            return false;
          }
          sync.hasLocalCreates = hasLocalChanges.create;
          sync.hasLocalUpdates = hasLocalChanges.update;
          sync.hasLocalDeletes = hasLocalChanges.delete;
          sync.quotaReached = this.isQuotaReached();
          sync.inProgress = false;
          sync.needsUpdateFromServer = !syncComplete;
          sync.lastUpdateFromServer = syncComplete ? Date.now() : 0;
          Console.info("Store tracks sync done: ", sync, this.operations.pendingOperations);
          this.syncStatus$.next(sync);
          return !syncComplete;
        })
      );
    });
  }

  private syncCreatedLocally(status: StoreLoadStatus): Observable<boolean> {
    return this.tableFullTrack.getWhere$(new DbTableWhereEquals('version', 0), 50).pipe(
      switchMap(items => {
        if (status.counter !== this.loaded$.value?.counter) return EMPTY;
        const toCreate = items.filter(item => this._errors.canProcess(item.uuid + '#' + item.owner, true));
        if (toCreate.length === 0) return of(true);
        Console.info('' + toCreate.length + ' tracks to be created on server');
        const limiter = new RequestLimiter(2);
        const requests: Observable<any>[] = [];
        for (const item of toCreate) {
          const request = this.createItemRequest(status, item);
          requests.push(limiter.add(request));
        }
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
  private createItemRequest(status: StoreLoadStatus, item: TrackItem): () => Observable<any> {
    return () => {
      if (status.counter !== this.loaded$.value?.counter) return EMPTY;
      return this.injector.get(HttpService).post<TrackDto>(environment.apiBaseUrl + '/track/v1', item.track).pipe(
        switchMap(result => {
          if (status.counter !== this.loaded$.value?.counter) return EMPTY;
          Console.info("track created on server", result.uuid);
          this._errors.itemSuccess(item.uuid + '#' + item.owner);
          this.quotaService.updateQuotas(q => {
            q.tracksUsed++;
            q.tracksSizeUsed += result.sizeUsed ?? 0;
          });
          return this.tableFullTrack.setOne$({
            key: result.uuid + '#' + result.owner,
            uuid: result.uuid,
            owner: result.owner,
            version: result.version,
            updatedLocally: 0,
            track: result,
          });
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

  private syncDeletedLocally(status: StoreLoadStatus): Observable<any> {
    return this.tableFullTrack.getWhere$(new DbTableWhereEquals('version', -1), 50).pipe(
      switchMap(items => {
        if (status.counter !== this.loaded$.value?.counter) return EMPTY;
        if (items.length === 0) return of(true);
        Console.info('' + items.length + ' tracks deleted locally');
        const keys = items.map(item => item.uuid + '#' + item.owner);
        const uuids = items.filter(item => item.owner === status.email).map(item => item.uuid);
        Console.info('' + uuids.length + ' tracks to be deleted on server');
        return (uuids.length > 0 ? this.injector.get(HttpService).post<void>(environment.apiBaseUrl + '/track/v1/_bulkDelete', uuids) : EMPTY).pipe(
          defaultIfEmpty(true),
          switchMap(() => {
            if (status.counter !== this.loaded$.value?.counter) return EMPTY;
            this.quotaService.updateQuotas(q => {
              q.tracksUsed -= uuids.length;
              q.tracksSizeUsed -= items.filter(item => item.owner === status.email).reduce((p,n) => p + (n.track?.sizeUsed ?? 0), 0);
            });
            return this.tableFullTrack.deleteMany$(keys).pipe(map(() => uuids.length < 50));
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

  private syncUpdatesFromServer(status: StoreLoadStatus): Observable<any> {
    return this.tableFullTrack.getWhereMapping$(new DbTableWhereGreaterThan('version', 0), item => ({uuid: item.uuid, owner: item.owner, version: item.version})).pipe(
      switchMap(known => {
        if (status.counter !== this.loaded$.value?.counter) return EMPTY;
        return this.injector.get(HttpService).post<UpdatesResponse<{uuid: string, owner: string}>>(environment.apiBaseUrl + '/track/v1/_bulkGetUpdates', known).pipe(
          switchMap(response => {
            if (status.counter !== this.loaded$.value?.counter) return EMPTY;
            Console.info('Server updates for tracks: sent ' + known.length + ' known tracks, received ' + response.created.length + ' new tracks, ' + response.updated.length + ' updated tracks, ' + response.deleted.length + ' deleted tracks');
            let operations$: Observable<any>;
            if (response.deleted.length > 0) {
              operations$ = this.updatesFromServer(status, [], response.deleted);
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
                  if (status.counter !== this.loaded$.value?.counter) {
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
                    switchMap(responses => this.updatesFromServer(status, responses.filter(t => !!t), [])),
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

  private syncUpdatesToServer(status: StoreLoadStatus): Observable<boolean> {
    return this.tableFullTrack.getWhere$(new DbTableWhereEquals('updatedLocally', 1), 50).pipe(
      switchMap(items => {
        if (status.counter !== this.loaded$.value?.counter) return EMPTY;
        const toUpdate = items.filter(item => this._errors.canProcess(item.uuid + '#' + item.owner, false));
        if (toUpdate.length === 0) return of(true);
        Console.info('' + toUpdate.length + ' tracks to be updated on server');
        const limiter = new RequestLimiter(2);
        const requests: Observable<TrackDto>[] = [];
        for (const item of toUpdate) {
          const request = () => {
            if (status.counter !== this.loaded$.value?.counter) return EMPTY;
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
        }
        return (requests.length === 0 ? of([]) : zip(requests)).pipe(
          switchMap(responses => this.updatesFromServer(status, responses, [])),
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

  private updatesFromServer(status: StoreLoadStatus, tracks: TrackDto[], deleted: { uuid: string, owner: string }[]): Observable<any> {
    if (status.counter !== this.loaded$.value?.counter) return EMPTY;
    if (tracks.length === 0 && deleted.length === 0) return of(true);
    for (const t of tracks) this._errors.itemSuccess(t.uuid + '#' + t.owner);
    for (const t of deleted) this._errors.itemSuccess(t.uuid + '#' + t.owner);
    return from(this.database.transaction$(false, [this.tableMeta.name, this.tableSimplifiedTrack.name, this.tableFullTrack.name], async () => {
      if (deleted.length > 0) {
        const keys = deleted.map(item => item.uuid + '#' + item.owner);
        await firstValueFrom(forkJoin([
          this.tableMeta.deleteMany$(keys),
          this.tableSimplifiedTrack.deleteMany$(keys),
          this.tableFullTrack.deleteMany$(keys),
        ]));
        if (status.counter !== this.loaded$.value?.counter) return;
        for (const key of keys) {
          this.fullTracks.get(key)?.newValue(null);
          this.simplifiedTracks.get(key)?.newValue(null);
          this.metadata.get(key)?.newValue(null);
        }
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
        const fulls$ = firstValueFrom(this.tableFullTrack.setMany$(fulls));
        const prefs = this.injector.get(PreferencesService);
        const mapService = this.injector.get(OfflineMapService);
        const entities = tracks.map(track => new Track(track, prefs, mapService));
        for (const entity of entities) this.fullTracks.get(entity.uuid + '#' + entity.owner)?.newValue(entity);
        const simplified$ = Promise.all(
          entities.map(track => this.injector.get(WorkerService).simplifyTrack(track).then(simplified => ({...simplified, key: track.uuid + '#' + track.owner})))
        ).then(simplified => {
          for (const s of simplified) this.simplifiedTracks.get(s.key)?.newValue(s);
          return firstValueFrom(this.tableSimplifiedTrack.setMany$(simplified));
        });
        const metadata = entities.map(track => ({...TrackDatabase.toMetadata(track), key: track.uuid + '#' + track.owner}));
        const meta$ = firstValueFrom(this.tableMeta.setMany$(metadata));
        for (const m of metadata) this.metadata.get(m.key)?.newValue(m);
        await Promise.all([fulls$, simplified$, meta$]);
        if (status.counter !== this.loaded$.value?.counter) return;
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
      this.tableFullTrack.keysWhere$(new DbTableWhereEquals('version', 0), 1),
      this.tableFullTrack.keysWhere$(new DbTableWhereLessThan('version', 0), 1),
      this.tableFullTrack.keysWhere$(new DbTableWhereEquals('updatedLocally', 1), 1),
    ])
    .pipe(
      first(),
      map(([r1, r2, r3]) => ({create: r1.length > 0, delete: r2.length > 0, update: r3.length > 0}))
    );
  }

  private hardDelete(): Observable<any> {
    return forkJoin([
      this.tableFullTrack.deleteAll$(),
      this.tableSimplifiedTrack.deleteAll$(),
      this.tableMeta.deleteAll$(),
      new Observable(subscriber => {
        this.fullTracks.forEach(item => item.newValue(null));
        this.simplifiedTracks.forEach(item => item.newValue(null));
        this.metadata.forEach(item => item.newValue(null));
        subscriber.next(true);
        subscriber.complete();
      }),
    ]);
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
