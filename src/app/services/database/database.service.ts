import { Injectable, NgZone } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import Dexie from 'dexie';
import { BehaviorSubject, Observable, combineLatest, debounceTime, filter, map, of, switchMap, tap, timeout } from 'rxjs';
import { StoreSyncStatus } from './store';
import { NetworkService } from '../network/network.service';
import { Console } from 'src/app/utils/console';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';

const DB_PREFIX = 'trailence_data_';
export const TRACK_TABLE_NAME = 'tracks';
export const TRAIL_TABLE_NAME = 'trails';
export const TRAIL_COLLECTION_TABLE_NAME = 'trail_collections';
export const TAG_TABLE_NAME = 'tags';
export const TRAIL_TAG_TABLE_NAME = 'trails_tags';
export const EXTENSIONS_TABLE_NAME = 'extensions';
export const SHARE_TABLE_NAME = 'shares';
export const PHOTO_TABLE_NAME = 'photos';
export const DEPENDENCIES_TABLE_NAME = 'dependencies';

const AUTO_UPDATE_FROM_SERVER_EVERY = 30 * 60 * 1000;
const MINIMUM_SYNC_INTERVAL = 15 * 1000;

export interface StoreRegistration {
  name: string;
  status$: Observable<StoreSyncStatus | null>;
  loaded$: Observable<boolean>;
  hasPendingOperations$: Observable<boolean>;
  syncFromServer: () => void;
  fireSyncStatus: () => void;
  doSync: () => Observable<boolean>;
  resetErrors: () => void;
}

class RegisteredStore implements StoreRegistration {

  name: string;
  status$: Observable<StoreSyncStatus | null>;
  loaded$: Observable<boolean>;
  hasPendingOperations$: Observable<boolean>;
  syncFromServer: () => void;
  fireSyncStatus: () => void;
  doSync: () => Observable<boolean>;
  resetErrors: () => void;

  lastSync = 0;
  syncTimeout?: any;
  syncTimeoutDate = 0;
  syncAgain = false;

  constructor(
    registration: StoreRegistration
  ) {
    this.name = registration.name;
    this.status$ = registration.status$;
    this.loaded$ = registration.loaded$;
    this.hasPendingOperations$ = registration.hasPendingOperations$;
    this.syncFromServer = registration.syncFromServer;
    this.fireSyncStatus = registration.fireSyncStatus;
    this.doSync = registration.doSync;
    this.resetErrors = registration.resetErrors;
  }
}

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {

  private readonly _db = new BehaviorSubject<Dexie | undefined>(undefined);
  private _openEmail?: string;
  private readonly _stores = new BehaviorSubject<RegisteredStore[]>([]);

  constructor(
    auth: AuthService,
    private readonly ngZone: NgZone,
    private readonly network: NetworkService,
  ) {
    auth.auth$.subscribe(
      auth => {
        if (!auth) this.close();
        else this.open(auth.email);
      }
    );
  }

  public get db$(): Observable<Dexie | undefined> { return this._db; }
  public get db(): Dexie | undefined { return this._db.value; }

  public get email(): string | undefined { return this._openEmail; }

  public get syncStatus(): Observable<boolean> {
    return this._stores.pipe(
      switchMap(stores => stores.length === 0 ? of([]) : combineLatest(stores.map(s => s.status$))),
      map(status => status.map(s => !!s?.inProgress).reduce((a,b) => a || b, false))
    );
  }

  public get hasLocalChanges(): Observable<boolean> {
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
            let hasChanges = statuses.map(s => !!s?.hasLocalChanges).reduce((a,b) => a || b, false);
            if (hasChanges) return true;
            hasChanges = operations.reduce((a,b) => a || b, false);
            return hasChanges;
          }),
          debounceTimeExtended(100, 100, undefined, (p, n) => n === true)
        );
      })
    );
  }

  public get lastSync(): Observable<number | undefined> {
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

  public allLoaded(): Observable<boolean> {
    return this._stores.pipe(
      switchMap(stores => stores.length === 0 ? of([]) : combineLatest(stores.map(s => s.loaded$))),
      map(loaded => loaded.reduce((a,b) => a && b, true))
    );
  }

  private _syncNowRequestedAt = 0;
  public syncNow(): void {
    this._syncNowRequestedAt = Date.now();
    this._stores.value.forEach(s => {
      s.resetErrors();
      s.lastSync = 0;
      if (s.syncTimeout) clearTimeout(s.syncTimeout);
      s.syncTimeout = undefined;
      s.syncTimeoutDate = 0;
      s.syncFromServer();
    });
  }

  public resetAll(): void {
    const db = this._db.value;
    const email = this._openEmail;
    if (db && email) {
      this.close();
      Dexie.delete(DB_PREFIX + email)
      .then(() => this.open(email));
    }
  }

  registerStore(store: StoreRegistration): void {
    const registered = new RegisteredStore(store);
    this._stores.value.push(registered);
    this._stores.next(this._stores.value);
    combineLatest([
      store.loaded$,         // local database is loaded
      this.network.server$,  // network is connected
      store.status$,         // there is something to sync and we are not syncing
      this.db$,
    ]).pipe(
      map(([storeLoaded, networkConnected, syncStatus, db]) => [storeLoaded && networkConnected && syncStatus?.needsSync && !syncStatus.inProgress, syncStatus?.needsUpdateFromServer, db]),
      tap(r => {
        if (!r[2]) {
          if (registered.syncTimeout) clearTimeout(registered.syncTimeout);
          registered.syncTimeout = undefined;
          registered.syncTimeoutDate = 0;
          registered.lastSync = 0;
        }
      }),
      filter(r => !!r[0] && !!r[2]), // should sync and database loaded
      filter(() => {
        if (Date.now() - registered.lastSync > MINIMUM_SYNC_INTERVAL) return true;
        if (this._syncNowRequestedAt >= registered.lastSync) return true;
        this.ngZone.runOutsideAngular(() => {
          const nextDate = Math.max(1000, MINIMUM_SYNC_INTERVAL - (Date.now() - registered.lastSync));
          if (registered.syncTimeout && registered.syncTimeoutDate > nextDate) {
            clearTimeout(registered.syncTimeout);
            registered.syncTimeout = undefined;
          }
          if (!registered.syncTimeout) {
            registered.syncTimeoutDate = nextDate;
            registered.syncTimeout = setTimeout(() => store.fireSyncStatus(), nextDate);
          }
        });
        return false;
      }),
      map(value => [...value, registered.syncAgain] as [boolean | undefined, boolean | undefined, Dexie | undefined, boolean]),
      debounceTimeExtended(0, 5000, 5, (p, n) => !!n[1] || p[2] !== n[2] || n[3]), // sync requested or db changed or syncAgain requested
    )
    .subscribe(() => {
      registered.syncAgain = false;
      registered.lastSync = Date.now();
      if (registered.syncTimeout) clearTimeout(registered.syncTimeout);
      registered.syncTimeout = undefined;
      registered.syncTimeoutDate = 0;
      store.doSync().subscribe(syncAgain => {
        registered.syncAgain = syncAgain;
        if (syncAgain) {
          Console.info(store.name + ' needs to sync again to complete');
          registered.lastSync = Date.now() - MINIMUM_SYNC_INTERVAL + 1000;
          store.fireSyncStatus();
        }
      });
    });
    // monitoring
    store.status$.pipe(map(s => !!(s?.inProgress)), debounceTime(60000), filter(progress => progress)).subscribe(() => {
      Console.warn('Store ' + store.name + ' is in progress since more than 1 minute !');
    });
    this.db$.pipe(switchMap(db => !db ? of(10) : store.loaded$.pipe(filter(l => l), timeout({first: 20000})))).subscribe({
      error: e => Console.warn('Store ' + store.name + ' is still not loaded after 20 seconds !', e),
      next: n => { if (n === true) Console.info("Store loaded: " + store.name); }
    });
  }

  private updateFromServerInterval: any = undefined;

  private close() {
    const db = this._db.value;
    if (db) {
      Console.info('Close DB')
      if (this.updateFromServerInterval) clearInterval(this.updateFromServerInterval);
      this.updateFromServerInterval = undefined;
      this._openEmail = undefined;
      this._db.next(undefined);
      db.close();
    }
  }

  private open(email: string): void {
    if (this._openEmail === email) return;
    this.close();
    Console.info('Open DB for user ' + email);
    this._openEmail = email;
    this.ngZone.runOutsideAngular(() => {
      const db = new Dexie(DB_PREFIX + email);
      const storesV1: any = {};
      storesV1[TRACK_TABLE_NAME] = 'id_owner';
      storesV1[TRAIL_TABLE_NAME] = 'id_owner';
      storesV1[TRAIL_COLLECTION_TABLE_NAME] = 'id_owner';
      storesV1[TAG_TABLE_NAME] = 'id_owner';
      storesV1[TRAIL_TAG_TABLE_NAME] = 'key';
      storesV1[EXTENSIONS_TABLE_NAME] = 'extension';
      storesV1[SHARE_TABLE_NAME] = 'key';
      storesV1[PHOTO_TABLE_NAME] = 'id_owner';
      storesV1[DEPENDENCIES_TABLE_NAME] = 'key';
      db.version(1).stores(storesV1);
      this._db.next(db);
      this.initAutoUpdateFromServer();
    });
  }

  private initAutoUpdateFromServer(): void {
    // launch update from server every AUTO_UPDATE_FROM_SERVER_EVERY
    this.ngZone.runOutsideAngular(() => {
      setInterval(() => {
        Console.info('trigger updates from server interval');
        for (const store of this._stores.value) {
          store.syncFromServer();
        }
      }, AUTO_UPDATE_FROM_SERVER_EVERY);
    });
  }

}
