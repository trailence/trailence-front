import { BehaviorSubject, Observable, catchError, combineLatest, debounceTime, defaultIfEmpty, filter, first, from, map, of, timeout } from "rxjs";
import { DatabaseService } from "./database.service";
import Dexie, { Table } from "dexie";
import { NetworkService } from "../network/network.service";
import { Injector, NgZone } from "@angular/core";
import { SynchronizationLocks } from './synchronization-locks';

export interface StoreSyncStatus {

    get needsSync(): boolean;
    get hasLocalChanges(): boolean;

    inProgress: boolean;
    needsUpdateFromServer: boolean;
    lastUpdateFromServer?: number;
}

const AUTO_UPDATE_FROM_SERVER_EVERY = 30 * 60 * 1000;
const MINIMUM_SYNC_INTERVAL = 30 * 1000;

export abstract class Store<STORE_ITEM, DB_ITEM, SYNCSTATUS extends StoreSyncStatus> {

  protected _db?: Dexie;
  protected ngZone: NgZone;

  protected _store = new BehaviorSubject<BehaviorSubject<STORE_ITEM | null>[]>([]);
  protected _createdLocally: BehaviorSubject<STORE_ITEM | null>[] = [];
  protected _deletedLocally: STORE_ITEM[] = [];
  protected _locks = new SynchronizationLocks();

  private _storeLoaded$ = new BehaviorSubject<boolean>(false);
  private _lastSync = 0;
  private _syncTimeout?: any;

  private _operationInProgress$ = new BehaviorSubject<boolean>(false);

  constructor(
    protected tableName: string,
    protected injector: Injector,
  ) {
    this.ngZone = injector.get(NgZone);
  }

  protected abstract readyToSave(entity: STORE_ITEM): boolean;
  protected abstract readyToSave$(entity: STORE_ITEM): Observable<boolean>;

  protected abstract isDeletedLocally(item: DB_ITEM): boolean;
  protected abstract isCreatedLocally(item: DB_ITEM): boolean;

  protected syncNow(): void {
    this._lastSync = 0;
    if (this._syncTimeout) clearTimeout(this._syncTimeout);
    this._syncTimeout = undefined;
    this.fireSync();
  }
  protected abstract fireSync(): void;

  public getAll$(): Observable<Observable<STORE_ITEM | null>[]> {
    return this._store;
  }

  protected _initStore(): void {
    const dbService = this.injector.get(DatabaseService);
    dbService.registerStore({status: this.syncStatus$, syncNow: () => this.syncNow(), loaded$: this._storeLoaded$});
    // listen to database change (when authentication changed)
    dbService.db$.subscribe(db => {
      if (db) this.load(db);
      else this.close();
    });

    // we need to sync when:
    combineLatest([
      this._storeLoaded$,         // local database is loaded
      this.injector.get(NetworkService).server$,    // network is connected
      this.syncStatus$,           // there is something to sync and we are not syncing
      this._operationInProgress$, // and no operation in progress
    ]).pipe(
      debounceTime(5000),
      map(([storeLoaded, networkConnected, syncStatus]) => storeLoaded && networkConnected && syncStatus.needsSync && !syncStatus.inProgress),
      filter(shouldSync => {
        if (!shouldSync) return false;
        if (Date.now() - this._lastSync < MINIMUM_SYNC_INTERVAL) {
          this.ngZone.runOutsideAngular(() => {
            if (!this._syncTimeout) {
              this._syncTimeout = setTimeout(() => this.syncStatus = this.syncStatus, Math.max(1000, MINIMUM_SYNC_INTERVAL - (Date.now() - this._lastSync)));
            }
          });
          return false;
        }
        return true;
      }),
      debounceTime(3000),
    )
    .subscribe(() => {
      this._lastSync = Date.now();
      if (this._syncTimeout) clearTimeout(this._syncTimeout);
      this._syncTimeout = undefined;
      if (!this._db) return;
      this.sync();
    });

    // launch update from server every 30 minutes
    let updateFromServerTimeout: any = undefined;
    this._storeLoaded$.subscribe(() => {
      if (updateFromServerTimeout) clearTimeout(updateFromServerTimeout);
      updateFromServerTimeout = undefined;
    });
    let previousNeeded = false;
    this.syncStatus$.subscribe(status => {
      if (!previousNeeded && status.needsUpdateFromServer) {
        previousNeeded = true;
      } else if (previousNeeded && !status.needsUpdateFromServer) {
        previousNeeded = false;
        if (updateFromServerTimeout) clearTimeout(updateFromServerTimeout);
        this.ngZone.runOutsideAngular(() => {
          updateFromServerTimeout = setTimeout(() =>
            this.performOperation(
              () => false,
              () => of(true),
              status => {
                if (status.needsUpdateFromServer) return false;
                status.needsUpdateFromServer = true;
                return true;
              }
            ),
            AUTO_UPDATE_FROM_SERVER_EVERY
          );
        });
      }
    });
  }

  public abstract get syncStatus$(): Observable<SYNCSTATUS>;
  public abstract get syncStatus(): SYNCSTATUS;
  protected abstract set syncStatus(status: SYNCSTATUS);

  protected abstract itemFromDb(item: DB_ITEM): STORE_ITEM;
  protected abstract areSame(item1: STORE_ITEM, item2: STORE_ITEM): boolean;

  protected abstract sync(): void;

  protected close(): void {
    if (!this._db) return;
    this.ngZone.runOutsideAngular(() => {
      this._locks = new SynchronizationLocks();
      this._db = undefined;
      this._storeLoaded$.next(false);
      const items = this._store.value;
      this._store.next([]);
      this._createdLocally = [];
      this._deletedLocally = [];
      items.forEach(item$ => item$.complete());
    });
  }

  private load(db: Dexie): void {
    if (this._db) this.close();
    this.ngZone.runOutsideAngular(() => {
      this._db = db;
      this._locks = new SynchronizationLocks();
      from(db.table<DB_ITEM>(this.tableName).toArray()).subscribe(
        items => {
          if (this._db !== db) return;
          if (this._syncTimeout) clearTimeout(this._syncTimeout);
          this._syncTimeout = undefined;
          this._lastSync = 0;
          const newStore: BehaviorSubject<STORE_ITEM | null>[] = [];
          items.forEach(dbItem => {
            const item = this.itemFromDb(dbItem);
            if (this.isDeletedLocally(dbItem)) this._deletedLocally.push(item);
            else {
              const item$ = new BehaviorSubject<STORE_ITEM | null>(item);
              if (this.isCreatedLocally(dbItem)) this._createdLocally.push(item$);
              newStore.push(item$);
            }
          });
          this._store.next(newStore);
          this.beforeEmittingStoreLoaded();
          this._storeLoaded$.next(true);
        }
      );
    });
  }

  protected beforeEmittingStoreLoaded(): void {
    // nothing by default
  }

  private operationsQueue: ((resolve: (done: boolean) => void) => void)[] = [];

  protected performOperation(
    storeUpdater: () => void,
    tableUpdater: (db: Dexie) => Observable<any>,
    statusUpdater: (status: SYNCSTATUS) => boolean,
    ondone?: () => void,
    oncancelled?: () => void,
  ): void {
    const db = this._db!;
    const operationExecution = (resolve: (done: boolean) => void) => {
      if (this._db !== db) {
        if (oncancelled) oncancelled();
        resolve(false);
        return;
      }
      let tableUpdate;
      try {
        storeUpdater();
        tableUpdate = tableUpdater(db);
      } catch (e) {
        console.error(e);
        if (ondone) ondone();
        resolve(true);
        return;
      }
      tableUpdate
      .pipe(defaultIfEmpty(true), catchError(error => of(true)))
      .subscribe(() => {
        const status = this.syncStatus;
        let statusUpdated = false;
        try {
          statusUpdated = statusUpdater(status);
        } catch (e) {
          console.error(e);
        }
        if (statusUpdated) {
          this._lastSync = 0;
          this.syncStatus = status;
        }
        if (ondone) ondone();
        resolve(true);
      });
    };
    this.operationsQueue.push(operationExecution);
    if (this._operationInProgress$.value) return;
    if (this._storeLoaded$.value) {
      this.launchOperationQueue();
      return;
    }
    if (this.operationsQueue.length === 1)
      this._storeLoaded$.pipe(
        filter(loaded => loaded),
        first()
      ).subscribe(() => this.launchOperationQueue());
  }

  private launchOperationQueue(): void {
    this._operationInProgress$.next(true);
    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => this.executeNextOperation(), 0);
    });
  }

  private executeNextOperation(): void {
    if (this.operationsQueue.length === 0) {
      this._operationInProgress$.next(false);
      return;
    }
    const operation = this.operationsQueue.splice(0, 1)[0];
    operation(() => {
      this.ngZone.runOutsideAngular(() => {
        setTimeout(() => this.executeNextOperation(), 0);
      });
    });
  }

  protected waitReadyWithTimeout(entities: STORE_ITEM[]): Observable<STORE_ITEM[]> {
    return combineLatest(
      entities.map(entity => this.readyToSave$(entity).pipe(
        filter(ready => ready),
        timeout({ first: 5000, with: () => of(false) })
      ))
    ).pipe(
      debounceTime(500),
      first(),
      map(readiness => entities.filter((entity, index) => readiness[index]))
    )
  }

  protected abstract dbItemCreatedLocally(item: STORE_ITEM): DB_ITEM;
  protected abstract updateStatusWithLocalCreate(status: SYNCSTATUS): boolean;

  public create(item: STORE_ITEM, ondone?: () => void): Observable<STORE_ITEM | null> {
    const item$ = new BehaviorSubject<STORE_ITEM | null>(item);
    let existing = false;
    this.performOperation(
      () => {
        existing = !!this._store.value.find(value => value.value && this.areSame(value.value, item));
        if (!existing) {
          this._createdLocally.push(item$);
          this._store.value.push(item$);
          this._store.next(this._store.value);
        }
      },
      db => existing ? of(true) : from(db.table<DB_ITEM>(this.tableName).add(this.dbItemCreatedLocally(item))),
      status => {
        if (existing) return false;
        return this.updateStatusWithLocalCreate(status);
      },
      ondone
    );
    return item$;
  }

  protected deleted(item$: BehaviorSubject<STORE_ITEM | null> | undefined, item: STORE_ITEM): void {
    // nothing by default
  }

  protected abstract markDeletedInDb(table: Table<DB_ITEM>, item: STORE_ITEM): Observable<any>;

  protected abstract updateStatusWithLocalDelete(status: SYNCSTATUS): boolean;

  public delete(item: STORE_ITEM, ondone?: () => void): void {
    this.performOperation(
      () => {
        const index = this._store.value.findIndex(item$ => item$.value && this.areSame(item$.value, item));
        const entity$ = index >= 0 ? this._store.value[index] : undefined;
        entity$?.next(null);
        if (this._deletedLocally.indexOf(item) < 0)
          this._deletedLocally.push(item);
        if (entity$) {
          const created = this._createdLocally.indexOf(entity$);
          if (created) this._createdLocally.splice(created, 1);
        }
        this.deleted(entity$, item);
        if (index >= 0) {
          this._store.value.splice(index, 1);
          this._store.next(this._store.value);
        }
      },
      db => this.markDeletedInDb(db.table<DB_ITEM>(this.tableName), item),
      status => this.updateStatusWithLocalDelete(status),
      ondone,
    );
  }

  public deleteIf(predicate: (item: STORE_ITEM) => boolean, ondone?: () => void): void {
    let items: STORE_ITEM[] = [];
    this.performOperation(
      () => {
        const toDelete = this._store.value.filter(item$ => item$.value && predicate(item$.value));
        if (toDelete.length === 0) return;
        toDelete.forEach(item$ => {
          const item = item$.value!;
          items.push(item);
          if (this._deletedLocally.indexOf(item) < 0)
            this._deletedLocally.push(item);
          const created = this._createdLocally.indexOf(item$);
          if (created) this._createdLocally.splice(created, 1);
          item$.next(null);
          this.deleted(item$, item);
          const index = this._store.value.indexOf(item$);
          if (index >= 0) this._store.value.splice(index, 1);
        });
        this._store.next(this._store.value);
      },
      db => items.length === 0 ? of(true) : combineLatest(items.map(item => this.markDeletedInDb(db.table<DB_ITEM>(this.tableName), item))),
      status => items.length === 0 ? false : this.updateStatusWithLocalDelete(status),
      ondone
    );
  }

  public cleanDatabase(db: Dexie, email: string): Observable<any> {
    return new Observable(subscriber => {
      const dbService = this.injector.get(DatabaseService);
      if (db !== dbService.db || email !== dbService.email) {
        subscriber.next(false);
        subscriber.complete();
        return;
      }
      this.performOperation(
        () => {},
        dbo => this.doCleaning(email, dbo),
        () => false,
        () => {
          subscriber.next(true);
          subscriber.complete();
        },
        () => {
          subscriber.next(false);
          subscriber.complete();
        }
      )
    });
  }

  protected abstract doCleaning(email: string, db: Dexie): Observable<any>;

}
