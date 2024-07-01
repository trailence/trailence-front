import { BehaviorSubject, Observable, Subscription, catchError, combineLatest, debounceTime, defaultIfEmpty, filter, first, from, map, of, timeout } from "rxjs";
import { DatabaseService } from "./database.service";
import Dexie, { Table } from "dexie";
import { NetworkService } from "../network/newtork.service";
import { NgZone } from "@angular/core";

export interface StoreSyncStatus {

    get needsSync(): boolean;

    inProgress: boolean;
    needsUpdateFromServer: boolean;
}

const AUTO_UPDATE_FROM_SERVER_EVERY = 30 * 60 * 1000;
const MINIMUM_SYNC_INTERVAL = 30 * 1000;

export abstract class Store<STORE_ITEM, DB_ITEM, SYNCSTATUS extends StoreSyncStatus> {

  protected _db?: Dexie;

  protected _store = new BehaviorSubject<BehaviorSubject<STORE_ITEM | null>[]>([]);
  protected _createdLocally: BehaviorSubject<STORE_ITEM | null>[] = [];
  protected _deletedLocally: STORE_ITEM[] = [];

  private _storeLoaded$ = new BehaviorSubject<boolean>(false);
  private _lastSync = 0;
  private _syncTimeout?: any;

  private _operationInProgress$ = new BehaviorSubject<boolean>(false);

  constructor(
    protected tableName: string,
    protected databaseService: DatabaseService,
    protected network: NetworkService,
    protected ngZone: NgZone,
  ) {}

  protected abstract readyToSave(entity: STORE_ITEM): boolean;
  protected abstract readyToSave$(entity: STORE_ITEM): Observable<boolean>;

  protected abstract isDeletedLocally(item: DB_ITEM): boolean;
  protected abstract isCreatedLocally(item: DB_ITEM): boolean;

  public getAll$(): Observable<Observable<STORE_ITEM | null>[]> {
    return this._store;
  }

  protected _initStore(): void {
    this.databaseService.registerStore(this.syncStatus$);
    // listen to database change (when authentication changed)
    this.databaseService.db$.subscribe(db => {
      if (db) this.load(db);
      else this.close();
    });

    // we need to sync when:
    combineLatest([
      this._storeLoaded$,         // local database is loaded
      this.network.connected$,    // network is connected
      this.syncStatus$,           // there is something to sync and we are not syncing
      this._operationInProgress$, // and no operation in progress
    ]).pipe(
      debounceTime(1000),
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
    )
    .subscribe(() => {
      this._lastSync = Date.now();
      if (this._syncTimeout) clearTimeout(this._syncTimeout);
      this._syncTimeout = undefined;
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
    this._db = undefined;
    this._storeLoaded$.next(false);
    const items = this._store.value;
    this._store.next([]);
    this._createdLocally = [];
    this._deletedLocally = [];
    items.forEach(item$ => item$.complete());
  }

  private load(db: Dexie): void {
    if (this._db) this.close();
    this._db = db;
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
  }

  protected beforeEmittingStoreLoaded(): void {
    // nothing by default
  }

  protected performOperation(
    storeUpdater: () => void,
    tableUpdater: (db: Dexie) => Observable<any>,
    statusUpdater: (status: SYNCSTATUS) => boolean,
    ondone?: () => void,
  ): void {
    const db = this._db!;
    let done = false;
    let subscription: Subscription | undefined = undefined;
    subscription = combineLatest([this._storeLoaded$, this._operationInProgress$])
    .subscribe(([loaded, operationInProgress]) => {
      if (!loaded || operationInProgress) return;
      if (subscription) {
        subscription.unsubscribe();
      }
      if (done || this._db !== db) return;
      done = true;

      this._operationInProgress$.next(true);
      let tableUpdate;
      try {
        storeUpdater();
        tableUpdate = tableUpdater(db);
      } catch (e) {
        console.error(e);
        this._operationInProgress$.next(false);
        if (ondone) ondone();
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
        this._operationInProgress$.next(false);
        if (ondone) ondone();
      });
    })
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

  public create(item: STORE_ITEM): Observable<STORE_ITEM | null> {
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
      }
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

}
