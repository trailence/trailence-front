import { BehaviorSubject, Observable, Subscription, catchError, combineLatest, defaultIfEmpty, filter, from, map, of } from "rxjs";
import { DatabaseService } from "./database.service";
import Dexie from "dexie";
import { NetworkService } from "../network/newtork.service";

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
    private _storeLoaded$ = new BehaviorSubject<boolean>(false);
    private _lastSync = 0;
    private _syncTimeout?: any;

    private _operationInProgress$ = new BehaviorSubject<boolean>(false);

    constructor(
        protected tableName: string,
        protected databaseService: DatabaseService,
        protected network: NetworkService,
    ) {}

    protected _initStore(): void {
        this.databaseService.registerStore(this);
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
          map(([storeLoaded, networkConnected, syncStatus]) => storeLoaded && networkConnected && syncStatus.needsSync && !syncStatus.inProgress),
          filter(shouldSync => {
            if (!shouldSync) return false;
            if (Date.now() - this._lastSync < MINIMUM_SYNC_INTERVAL) {
              if (!this._syncTimeout) {
                this._syncTimeout = setTimeout(() => this.syncStatus = this.syncStatus, Math.max(1000, MINIMUM_SYNC_INTERVAL - (Date.now() - this._lastSync)));
              }
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
          }
        });
    }

    public abstract get syncStatus$(): Observable<SYNCSTATUS>;
    public abstract get syncStatus(): SYNCSTATUS;
    protected abstract set syncStatus(status: SYNCSTATUS);

    protected abstract itemFromDb(item: DB_ITEM): STORE_ITEM;

    protected abstract sync(): void;

    
  protected close(): void {
    if (!this._db) return;
    this._db = undefined;
    this._storeLoaded$.next(false);
    const items = this._store.value;
    this._store.next([]);
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
        items.forEach(item => newStore.push(new BehaviorSubject<STORE_ITEM | null>(this.itemFromDb(item))));
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
    storeUpdater: (store: BehaviorSubject<STORE_ITEM | null>[]) => boolean,
    tableUpdater: (db: Dexie) => Observable<any>,
    statusUpdater: (status: SYNCSTATUS) => boolean
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
      if (storeUpdater(this._store.value)) {
        this._store.next(this._store.value);
      }
      tableUpdater(db)
      .pipe(defaultIfEmpty(true), catchError(error => of(true)))
      .subscribe(() => {
        const status = this.syncStatus;
        if (statusUpdater(status)) {
          this._lastSync = 0;
          this.syncStatus = status;
        }
        this._operationInProgress$.next(false);
      });
    })
  }

}