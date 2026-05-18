import { Injectable, Injector, NgZone } from '@angular/core';
import { BehaviorSubject, catchError, combineLatest, debounceTime, defaultIfEmpty, distinctUntilChanged, EMPTY, filter, map, Observable, of, Subscription, switchMap, tap, timeout } from 'rxjs';
import { StoreLoadStatus, StoreSyncStatus } from './store';
import { Console } from 'src/app/utils/console';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { NetworkService } from '../../network/network.service';
import { AuthService } from '../../auth/auth.service';
import { DbStatus } from '../storage/db-table';

const AUTO_UPDATE_FROM_SERVER_EVERY = 30 * 60 * 1000;
const MINIMUM_SYNC_INTERVAL = 15 * 1000;

export interface StoreRegistration {
  name: string;
  store: any,
  status$: Observable<StoreSyncStatus | null>;
  loadStatus$: Observable<StoreLoadStatus | undefined>;
  hasPendingOperations$: Observable<boolean>;
  syncFromServer: () => void;
  fireSyncStatus: () => void;
  doSync: () => Observable<boolean>;
  resetErrors: () => void;
  hardDelete: () => Observable<any>;
}

export interface StoreWithCleaning {
  cleaningDependencies(): string[];
  doCleaning(): Observable<any>;
}

@Injectable({providedIn: 'root'})
export class StoreService {

  private readonly _stores = new BehaviorSubject<RegisteredStore[]>([]);
  private readonly storeInterface: ServiceInterface;

  constructor(injector: Injector) {
    this.storeInterface = {
      injector,
      syncPaused: 0,
      syncNowRequestedAt: 0,
      resetPauses: () => {
        this._pauses.splice(0, this._pauses.length);
        this.storeInterface.syncPaused = 0;
      }
    };

    // launch update from server every AUTO_UPDATE_FROM_SERVER_EVERY
    injector.get(NgZone).runOutsideAngular(() => {
      setInterval(() => {
        Console.info('trigger updates from server interval');
        for (const store of this._stores.value) {
          store.syncFromServer();
        }
      }, AUTO_UPDATE_FROM_SERVER_EVERY);
    });

    // database cleaning
    this.startDatabaseCleaning();
  }

  registerStore(store: StoreRegistration): void {
    const registered = new RegisteredStore(this.storeInterface, store);
    this._stores.value.push(registered);
    registered.start();
    this._stores.next(this._stores.value);
  }

  public syncNow(): void {
    this.storeInterface.syncNowRequestedAt = Date.now();
    this.storeInterface.syncPaused = 0;
    for (const s of this._stores.value) {
      s.resetErrors();
      s.lastSync = 0;
      if (s.syncTimeout) clearTimeout(s.syncTimeout);
      s.syncTimeout = undefined;
      s.syncTimeoutDate = 0;
      s.syncFromServer();
    }
  }

  public triggerStoreSync(name: string): void {
    const store = this._stores.value.find(s => s.name === name);
    if (store) {
      store.lastSync = 0;
      store.syncAgain = true;
      store.fireSyncStatus();
    }
  }

  private _pauseCounter = 0;
  private readonly _pauses: number[] = [];
  public pauseSync(): number {
    const id = ++this._pauseCounter;
    Console.info('Pause sync', id);
    this._pauses.push(id);
    this.storeInterface.syncPaused = Date.now();
    return id;
  }

  public resumeSync(id: number): void {
    Console.info('Resume sync', id);
    const index = this._pauses.indexOf(id);
    if (index >= 0) this._pauses.splice(index, 1);
    if (this._pauses.length === 0) {
      const previous = this.storeInterface.syncPaused
      this.storeInterface.syncPaused = 0;
      if (previous > 0 && Date.now() - previous > 60000)
        for (const s of this._stores.value) s.fireSyncStatus();
    }
  }

  public get allLoaded$(): Observable<boolean> {
    return this._stores.pipe(
      switchMap(stores => stores.length === 0 ? of([]) : combineLatest(stores.map(s => s.loadStatus$))),
      map(loaded => loaded.reduce((a,b) => !!a && !!b, true)),
    );
  }

  public get syncStatus$(): Observable<boolean> {
    return this._stores.pipe(
      switchMap(stores => stores.length === 0 ? of([]) : combineLatest(stores.map(s => s.status$))),
      map(status => status.map(s => !!s?.inProgress).some(Boolean))
    );
  }

  public get localChanges$(): Observable<boolean> {
    return this._stores.pipe(
      switchMap(stores => {
        if (stores.length === 0) return of(false);
        return combineLatest(
          [
            combineLatest(stores.map(s => s.status$)),
            combineLatest(stores.map(s => s.hasPendingOperations$)),
          ]
        ).pipe(
          map(([statuses, operations]) => {
            let hasChanges = statuses.map(s => !!s?.hasLocalChanges).some(Boolean);
            if (hasChanges) return true;
            hasChanges = operations.some(Boolean);
            return hasChanges;
          }),
          distinctUntilChanged(),
        );
      })
    );
  }

  public get lastSync$(): Observable<number | undefined> {
    return this._stores.pipe(
      switchMap(stores => stores.length === 0 ? of([]) : combineLatest(stores.map(s => s.status$))),
      map(status => {
        let last = undefined;
        for (const s of status) {
          if (!s?.lastUpdateFromServer) last = null;
          else if (last !== null && (last === undefined || s.lastUpdateFromServer < last)) last = s.lastUpdateFromServer;
        }
        return last ?? undefined;
      })
    );
  }

  public hardDeleteLocalData(): void {
    const pauseId = this.pauseSync();
    this._cleaningSubscription?.unsubscribe();
    if (this._cleaningTimeout) clearTimeout(this._cleaningTimeout);
    this._stores.pipe(
      switchMap(stores => stores.length === 0 ? of([]) : combineLatest(stores.map(store => store.hardDeleteLocalData())))
    ).subscribe(() => {
      this.resumeSync(pauseId);
      this.startDatabaseCleaning();
    });
  }

  private _cleaningTimeout: any;
  private _cleaningSubscription?: Subscription;
  private startDatabaseCleaning(): void {
    this.storeInterface.injector.get(NgZone).runOutsideAngular(() =>
      this._cleaningSubscription = this.storeInterface.injector.get(AuthService).auth$.pipe(
        switchMap(auth => {
          if (!auth) return of(undefined);
          return this._stores.pipe(
            switchMap(stores => stores.length === 0 ? of([]) : combineLatest(stores.map(store => store.loadStatus$.pipe(map(status => ({store, status})))))),
            map(stores => {
              if (stores.length === 0) return undefined;
              if (stores.some(s => s.status?.email !== auth.email)) return undefined;
              const cleaningStores = stores.filter(s => s.store.store['doCleaning'] !== undefined && s.store.store['cleaningDependencies'] !== undefined);
              if (cleaningStores.length === 0) return undefined;
              return {auth, stores: cleaningStores.map(s => ({cleaning: s.store.store as StoreWithCleaning, name: s.store.name}))};
            })
          );
        }),
      ).subscribe(r => {
        if (this._cleaningTimeout) clearTimeout(this._cleaningTimeout);
        if (!r) return;
        const lastCleanStr = localStorage.getItem('trailence.db-cleaning.last-time.' + r.auth.email);
        const lastCleanTime = lastCleanStr ? Number.parseInt(lastCleanStr) : undefined;
        const nextCleanTime = lastCleanTime && !Number.isNaN(lastCleanTime) ? lastCleanTime + 24 * 60 * 60 * 1000 : Date.now() + 60000;
        const nextTimeout = Math.max(nextCleanTime - Date.now(), 60000);
        this._cleaningTimeout = setTimeout(() => this.cleanDatabase(r.stores).subscribe(done => {
          if (done) {
            Console.info('Database cleaned, next cleaning in 24 hours')
            localStorage.setItem('trailence.db-cleaning.last-time.' + r.auth.email, '' + Date.now());
          }
        }), nextTimeout);
      })
    );
  }

  private cleanDatabase(stores: {name: string, cleaning: StoreWithCleaning}[]): Observable<boolean> {
    const remaining = [...stores];
    const done: string[] = [];
    const next: () => Observable<boolean> = () => {
      if (remaining.length === 0) return of(true);
      const index = remaining.findIndex(s => s.cleaning.cleaningDependencies().every(dep => done.includes(dep)));
      if (index < 0) return of(false);
      const store = remaining.splice(index, 1)[0];
      return store.cleaning.doCleaning().pipe(switchMap(() => {
        done.push(store.name);
        return next();
      }));
    };
    return next();
  }

}

interface ServiceInterface {
  injector: Injector;
  syncPaused: number;
  syncNowRequestedAt: number;
  resetPauses: () => void;
}

class RegisteredStore implements StoreRegistration {

  name: string;
  store: any;
  status$: Observable<StoreSyncStatus | null>;
  loadStatus$: Observable<StoreLoadStatus | undefined>;
  hasPendingOperations$: Observable<boolean>;
  syncFromServer: () => void;
  fireSyncStatus: () => void;
  doSync: () => Observable<boolean>;
  resetErrors: () => void;
  hardDelete: () => Observable<any>;

  lastSync = 0;
  syncTimeout?: any;
  syncTimeoutDate = 0;
  syncAgain = false;
  inProgress$ = new BehaviorSubject<boolean>(false);

  constructor(
    private readonly service: ServiceInterface,
    registration: StoreRegistration
  ) {
    this.name = registration.name;
    this.store = registration.store;
    this.status$ = registration.status$;
    this.loadStatus$ = registration.loadStatus$;
    this.hasPendingOperations$ = registration.hasPendingOperations$;
    this.syncFromServer = registration.syncFromServer;
    this.fireSyncStatus = registration.fireSyncStatus;
    this.doSync = registration.doSync;
    this.resetErrors = registration.resetErrors;
    this.hardDelete = registration.hardDelete;
  }

  start(): void {
    const ngZone = this.service.injector.get(NgZone);
    ngZone.runOutsideAngular(() => {
      combineLatest([
        this.loadStatus$,                                   // local database is loaded
        this.service.injector.get(NetworkService).server$,  // network is connected
        this.status$,                                       // there is something to sync and we are not syncing
        this.service.injector.get(AuthService).permissionsChanged$,  // authenticated and not anonymous
      ]).pipe(
        map(([storeLoadStatus, networkConnected, syncStatus, auth]) => ({
          shouldSync: !!storeLoadStatus && !!networkConnected && !!syncStatus?.needsSync && !syncStatus.inProgress && !!auth && !auth.isAnonymous,
          needsUpdateFromServer: syncStatus?.needsUpdateFromServer,
          storeLoadStatus,
        })),
        tap(r => {
          if (!r.storeLoadStatus) {
            if (this.syncTimeout) clearTimeout(this.syncTimeout);
            this.syncTimeout = undefined;
            this.syncTimeoutDate = 0;
            this.lastSync = 0;
            this.resetErrors();
            this.inProgress$.next(false);
            this.syncAgain = false;
          }
        }),
        filter(r => r.shouldSync && !!r.storeLoadStatus),
        filter(() => {
          if (Date.now() - this.service.syncPaused > 120000) {
            this.service.resetPauses();
            if (Date.now() - this.lastSync > MINIMUM_SYNC_INTERVAL) return true;
            if (this.service.syncNowRequestedAt >= this.lastSync) return true;
          }
          ngZone.runOutsideAngular(() => {
            let nextTimeout = Date.now() - this.service.syncPaused < 120000 ? 15000 : Math.max(1000, MINIMUM_SYNC_INTERVAL - (Date.now() - this.lastSync));
            if (nextTimeout > MINIMUM_SYNC_INTERVAL) nextTimeout = MINIMUM_SYNC_INTERVAL;
            const nextDate = Date.now() + nextTimeout;
            if (this.syncTimeout && this.syncTimeoutDate > nextDate) {
              clearTimeout(this.syncTimeout);
              this.syncTimeout = undefined;
            }
            if (!this.syncTimeout) {
              this.syncTimeoutDate = nextDate;
              this.syncTimeout = setTimeout(() => {
                this.syncTimeout = undefined;
                this.syncTimeoutDate = 0;
                this.fireSyncStatus();
              }, nextTimeout);
              Console.info('Will trigger store update', this.name, nextTimeout);
            }
          });
          return false;
        }),
        map(v => ({...v, syncAgain: this.syncAgain}) as {shouldSync: boolean, needsUpdateFromServer: boolean | undefined, storeLoadStatus: DbStatus<any>, syncAgain: boolean}),
        // sync requested or db changed or syncAgain requested
        debounceTimeExtended(v => v.storeLoadStatus.isNewDb ? 0 : 3000, 5000, 5, (p, n) => !!n.needsUpdateFromServer || p.storeLoadStatus.counter !== n.storeLoadStatus.counter || n.syncAgain),
        switchMap(v => {
          if (this.inProgress$.value) return EMPTY;
          this.inProgress$.next(true);
          Console.info('Trigger store updates: ', this.name);
          this.syncAgain = false;
          this.lastSync = Date.now();
          if (this.syncTimeout) clearTimeout(this.syncTimeout);
          this.syncTimeout = undefined;
          this.syncTimeoutDate = 0;
          return this.doSync();
        })
      )
      .subscribe({
        next: syncAgain => {
          this.inProgress$.next(false);
          this.syncAgain = syncAgain;
          if (syncAgain) {
            Console.info(this.name + ' needs to sync again to complete');
            this.lastSync = Date.now() - MINIMUM_SYNC_INTERVAL + 1000;
            this.syncTimeoutDate = Date.now() + 2000;
            this.syncTimeout = setTimeout(() => this.fireSyncStatus(), 2000);
          }
        },
        complete: () => this.inProgress$.next(false),
        error: () => this.inProgress$.next(false),
      });
      // monitoring
      ngZone.runOutsideAngular(() => {
        this.status$.pipe(map(s => !!(s?.inProgress)), debounceTime(60000), filter(progress => progress)).subscribe(() => {
          Console.warn('Store ' + this.name + ' is in progress since more than 1 minute !');
        });
        this.loadStatus$.pipe(filter(s => !!s), timeout({first: 20000})).subscribe({
          error: e => Console.warn('Store ' + this.name + ' is still not loaded after 20 seconds !', e),
          next: () => { Console.info('Store loaded: ' + this.name); }
        });
      });
    });
  }

  hardDeleteLocalData(): Observable<any> {
    return this.inProgress$.pipe(
      filter(inProgress => !inProgress),
      switchMap(() => this.loadStatus$),
      filter(status => !!status),
      switchMap(() => this.hardDelete()),
      catchError(e => {
        Console.error('Error resetting store', this.name, e);
        return of(false);
      }),
      defaultIfEmpty(true),
    );
  }
}
