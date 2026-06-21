import { BehaviorSubject, EMPTY, Observable, catchError, combineLatest, debounceTime, defaultIfEmpty, filter, first, forkJoin, map, of, switchMap, timeout } from "rxjs";
import { Injector, NgZone } from "@angular/core";
import { SynchronizationLocks } from './synchronization-locks';
import { Console } from 'src/app/utils/console';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { StoreErrors } from './store-errors';
import { StoreOperations } from './store-operations';
import { DbStatus, DbTable } from '../storage/db-table';
import { StoreService } from './store.service';

export interface StoreSyncStatus {

    get needsSync(): boolean;
    get hasLocalChanges(): boolean;

    inProgress: boolean;
    needsUpdateFromServer: boolean;
    lastUpdateFromServer?: number;
}

export interface StoreSyncProgress {
  step: string;
  startedAt: number;
  syncCounter: number;
}

export interface StoreLoadStatus {
  counter: number;
  email: string;
}

export abstract class Store<STORE_ITEM, DB_ITEM, SYNCSTATUS extends StoreSyncStatus> {

  protected ngZone: NgZone;

  protected _store = new BehaviorSubject<BehaviorSubject<STORE_ITEM | null>[]>([]);
  protected _createdLocally: BehaviorSubject<STORE_ITEM | null>[] = [];
  protected _deletedLocally: STORE_ITEM[] = [];
  protected _updatedLocally: string[] = [];
  protected _errors: StoreErrors;
  protected _locks = new SynchronizationLocks();

  protected readonly _storeLoaded$ = new BehaviorSubject<StoreLoadStatus | undefined>(undefined);

  protected operations: StoreOperations;

  protected readonly _syncStatus$: BehaviorSubject<SYNCSTATUS>;

  private readonly _syncProgress$ = new BehaviorSubject<StoreSyncProgress | undefined>(undefined);
  private _syncProgressCounter = 0;

  constructor(
    protected readonly table: DbTable<DB_ITEM>,
    protected readonly injector: Injector,
    initialStatus: SYNCSTATUS,
  ) {
    this.ngZone = injector.get(NgZone);
    this._errors = new StoreErrors(injector, table.name, () => this.isQuotaReached());
    this._syncStatus$ = new BehaviorSubject(initialStatus);
    this.operations = new StoreOperations(table.name, this._storeLoaded$, this._syncStatus$, this.ngZone);
    this._syncProgress$.subscribe(p => {
      Console.debug('Store ' + table.name + ' -- sync: ', p);
    });
  }

  public get isLoaded$() { return this._storeLoaded$.pipe(map(l => !!l)); };

  public get syncStatus$() { return this._syncStatus$; }
  public get syncStatus() { return this._syncStatus$.value; }
  protected set syncStatus(status: SYNCSTATUS) { this._syncStatus$.next(status); }

  protected abstract isQuotaReached(): boolean;

  protected abstract readyToSave(entity: STORE_ITEM): boolean;
  protected abstract readyToSave$(entity: STORE_ITEM): Observable<boolean>;
  protected abstract createdLocallyCanBeRemoved(entity: STORE_ITEM): Observable<boolean>;

  protected abstract isDeletedLocally(item: DB_ITEM): boolean;
  protected abstract isCreatedLocally(item: DB_ITEM): boolean;
  protected abstract isUpdatedLocally(item: DB_ITEM): boolean;

  public getAll$(): Observable<Observable<STORE_ITEM | null>[]> {
    return this._store;
  }

  public getAllWhenLoaded$(): Observable<Observable<STORE_ITEM | null>[]> {
    return this._storeLoaded$.pipe(
      switchMap(loaded => {
        if (!loaded) return EMPTY;
        return this._store;
      })
    );
  }

  public getAllNow(): STORE_ITEM[] {
    return (this._store.value?.map(item$ => item$.value).filter(item => !!item) ?? []) as STORE_ITEM[];
  }

  public getOne$(predicate: (item: STORE_ITEM) => boolean): Observable<STORE_ITEM | null> {
    return this._store.pipe(
      switchMap(all => all.find(i$ => i$.value && predicate(i$.value)) || of(null))
    );
  }

  public getOneWhenLoaded$(predicate: (item: STORE_ITEM) => boolean): Observable<STORE_ITEM | null> {
    return this._storeLoaded$.pipe(
      switchMap(loaded => {
        if (!loaded) return EMPTY;
        return this._store;
      }),
      switchMap(all => all.find(i$ => i$.value && predicate(i$.value)) || of(null))
    );
  }

  protected startSync(): void {
    if (this._syncProgress$.value) {
      Console.warn('Store start a sync while already in progress', this.table.name, this._syncProgress$.value);
    }
    this._syncProgress$.next({
      step: 'Starting',
      startedAt: Date.now(),
      syncCounter: ++this._syncProgressCounter,
    });
  }

  protected syncStep(step: string): void {
    if (!this._syncProgress$.value) {
      Console.warn('Store indicates a progress, but there is no progress !!', step);
      return;
    }
    this._syncProgress$.next({
      step,
      startedAt: Date.now(),
      syncCounter: this._syncProgress$.value.syncCounter,
    })
  }

  protected syncEnd(): void {
    if (this._syncProgress$.value) {
      this._syncProgress$.next(undefined);
    } else {
      Console.warn('Store indicates the end of sync, but there is no progress !!');
    }
  }

  protected _initStore(name: string): void {
    this.injector.get(StoreService).registerStore({
      name,
      store: this,
      status$: this.syncStatus$,
      loadStatus$: this._storeLoaded$,
      hasPendingOperations$: this.operations.hasPendingOperations$,
      syncFromServer: () => this.triggerSyncFromServer(),
      fireSyncStatus: () => this.syncStatus = this.syncStatus, // NOSONAR
      doSync: () => this.sync(),
      resetErrors: () => this._errors.reset(),
      hardDelete: () => this.hardDelete(),
    });
    // listen to database change (when authentication changed)
    this.table.onStatus$().subscribe(status => {
      if (status) this.load(status);
      else this.unload();
    });
  }

  public triggerSyncFromServer(): void {
    this.ngZone.runOutsideAngular(() =>
      this._storeLoaded$.pipe(
        filterDefined(),
        first()
      ).subscribe(() => {
        this.performOperation(
          'trigger sync from server',
          () => false,
          () => of(true),
          status => {
            status.needsUpdateFromServer = true;
            return true;
          }
        );
      })
    );
  }

  protected abstract itemFromDb(item: DB_ITEM): STORE_ITEM;
  protected abstract areSame(item1: STORE_ITEM, item2: STORE_ITEM): boolean;
  protected abstract getKey(item: STORE_ITEM): string;

  protected abstract sync(): Observable<boolean>;

  private _loadingCounter = -1;

  protected stillValidChecker(): () => boolean {
    const counter = this._loadingCounter;
    return () => counter > 0 && counter === this._loadingCounter;
  }

  protected isStillValid(status: StoreLoadStatus): boolean {
    return status.counter === this._loadingCounter;
  }

  protected unload(): void {
    this._loadingCounter = -1;
    this.ngZone.runOutsideAngular(() => {
      this.operations.reset();
      this._errors.reset();
      this._locks = new SynchronizationLocks();
      this._storeLoaded$.next(undefined);
      const items = this._store.value;
      this._store.next([]);
      this._createdLocally = [];
      this._deletedLocally = [];
      this._updatedLocally = [];
      for (const item$ of items) item$.complete();
      this.afterClosed();
    });
  }

  private load(status: DbStatus<DB_ITEM>): void {
    this._loadingCounter = status.counter;
    this.ngZone.runOutsideAngular(() => {
      this._locks = new SynchronizationLocks();
      Console.info('Loading data from store', this.table.name);
      this.table.getAll$().subscribe({
        next: items => {
          if (this._loadingCounter !== status.counter) return;
          const newStore: BehaviorSubject<STORE_ITEM | null>[] = [];
          for (const dbItem of items) {
            const item = this.itemFromDb(dbItem);
            if (this.isDeletedLocally(dbItem)) this._deletedLocally.push(item);
            else {
              const item$ = new BehaviorSubject<STORE_ITEM | null>(item);
              if (this.isCreatedLocally(dbItem)) this._createdLocally.push(item$);
              else if (this.isUpdatedLocally(dbItem)) this._updatedLocally.push(this.getKey(item));
              newStore.push(item$);
            }
          }
          Console.info('Data loaded from store', this.table.name);
          this._store.next(newStore);
          this.beforeEmittingStoreLoaded();
          this._storeLoaded$.next({counter: status.counter, email: status.email!});
        },
        error: e => {
          Console.error('Error loading store ' + this.table.name, e);
        }
      });
    });
  }

  protected beforeEmittingStoreLoaded(): void {
    // nothing by default
  }

  protected abstract afterClosed(): void;

  protected performOperation(
    description: string,
    storeUpdater: () => void,
    tableUpdater: (status: StoreLoadStatus) => Observable<any>,
    statusUpdater: (status: SYNCSTATUS) => boolean,
    ondone?: () => void,
    oncancelled?: () => void,
  ): void {
    const status = this._storeLoaded$.value;
    if (!status) {
      if (oncancelled) oncancelled();
      return;
    }
    const operation = () => new Promise(resolve => {
      if (this._storeLoaded$.value?.counter !== status.counter) {
        if (oncancelled) oncancelled();
        resolve(false);
        return;
      }
      let tableUpdate;
      try {
        storeUpdater();
        tableUpdate = tableUpdater(status);
      } catch (e) {
        Console.error('Error updating store', e);
        if (ondone) ondone();
        resolve(true);
        return;
      }
      tableUpdate
      .pipe(defaultIfEmpty(true), catchError(() => of(true)))
      .subscribe(() => {
        const status = this.syncStatus;
        let statusUpdated = false;
        try {
          statusUpdated = statusUpdater(status);
        } catch (e) {
          Console.error('Error updating status', e);
        }
        if (statusUpdated) {
          this.syncStatus = status;
        }
        if (ondone) ondone();
        resolve(true);
      });
    });
    this.operations.push(description, operation);
  }

  protected waitReadyWithTimeout(entities: STORE_ITEM[]): Observable<STORE_ITEM[]> {
    if (entities.length === 0) return of([]);
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
    let existing: BehaviorSubject<STORE_ITEM | null> | undefined = undefined;
    let recovered = false;
    const inStore$ = new BehaviorSubject<BehaviorSubject<STORE_ITEM | null> | undefined>(undefined);
    this.performOperation(
      'create item',
      () => {
        existing = this._store.value.find(value => value.value && this.areSame(value.value, item));
        if (existing) {
          inStore$.next(existing);
        } else {
          this._createdLocally.push(item$);
          const deleted = this._deletedLocally.findIndex(value => this.areSame(value, item));
          if (deleted < 0) {
            this._store.value.push(item$);
          } else {
            this._deletedLocally.splice(deleted, 1);
            this._store.value.push(item$);
            recovered = true;
          }
          this._store.next(this._store.value);
          inStore$.next(item$);
        }
      },
      () => {
        if (existing) return of(true);
        if (recovered) return this.markUndeletedInDb(item);
        return this.table.addOne$(this.dbItemCreatedLocally(item));
      }, status => {
        if (existing) return false;
        return this.updateStatusWithLocalCreate(status);
      },
      ondone
    );
    return inStore$.pipe(
      filter(inStore => !!inStore),
      switchMap(inStore => inStore),
      first(),
    );
  }

  public createMany(items: STORE_ITEM[], ondone?: () => void): void {
    let existingList: STORE_ITEM[] = [];
    let recoveredList: STORE_ITEM[] = [];
    let nbNew = 0;
    this.performOperation(
      'create multiple items',
      () => {
        let storeChanged = false;
        for (const item of items) {
          const existing = this._store.value.some(value => value.value && this.areSame(value.value, item));
          let recovered = false;
          if (!existing) {
            const item$ = new BehaviorSubject<STORE_ITEM | null>(item);
            this._createdLocally.push(item$);
            const deleted = this._deletedLocally.findIndex(value => this.areSame(value, item));
            if (deleted < 0) {
              this._store.value.push(item$);
              storeChanged = true;
            } else {
              this._deletedLocally.splice(deleted, 1);
              this._store.value.push(item$);
              storeChanged = true;
              recovered = true;
            }
          }
          if (existing) existingList.push(item);
          else {
            if (recovered) recoveredList.push(item);
            nbNew++;
          }
        }
        if (storeChanged) this._store.next(this._store.value);
      },
      () => this.table.inTransaction$(false, () => {
        const toAdd: DB_ITEM[] = [];
        const ops: Observable<any>[] = [];
        for (const item of items) {
          if (existingList.includes(item)) continue;
          if (recoveredList.includes(item)) ops.push(this.markUndeletedInDb(item));
          else toAdd.push(this.dbItemCreatedLocally(item));
        }
        let result$ = (ops.length === 0 ? of([]) : forkJoin(ops));
        if (toAdd.length > 0)
          result$ = result$.pipe(switchMap(() => this.table.addMany$(toAdd)));
        return result$;
      }),
      status => {
        if (nbNew === 0) return false;
        return this.updateStatusWithLocalCreate(status);
      },
      ondone
    );
  }

  protected deleted(deleted: {item$: BehaviorSubject<STORE_ITEM | null> | undefined, item: STORE_ITEM}[]): void {
    for (const deletedItem of deleted) {
      const key = this.getKey(deletedItem.item);
      const updatedIndex = this._updatedLocally.indexOf(key);
      if (updatedIndex >= 0)
        this._updatedLocally.splice(updatedIndex, 1);
      const createdIndex = deletedItem.item$ ? this._createdLocally.indexOf(deletedItem.item$) : -1;
      if (createdIndex >= 0)
        this._createdLocally.splice(createdIndex, 1);
    }
  }

  protected abstract updated(item: STORE_ITEM): void;

  protected abstract markDeletedInDb(item: STORE_ITEM): Observable<any>;
  protected abstract markUndeletedInDb(item: STORE_ITEM): Observable<any>;
  protected abstract markUpdatedInDb(item: STORE_ITEM): Observable<any>;

  protected abstract updateStatusWithLocalDelete(status: SYNCSTATUS): boolean;
  protected abstract updateStatusWithLocalUpdate(status: SYNCSTATUS): boolean;

  public delete(item: STORE_ITEM, ondone?: () => void): void {
    this.performOperation(
      'delete item',
      () => {
        const index = this._store.value.findIndex(item$ => item$.value && this.areSame(item$.value, item));
        const entity$ = index >= 0 ? this._store.value[index] : undefined;
        entity$?.next(null);
        let createdLocally = false;
        if (entity$) {
          const created = this._createdLocally.indexOf(entity$);
          if (created >= 0) {
            this._createdLocally.splice(created, 1);
            createdLocally = true;
          }
        }
        if (!this._deletedLocally.includes(item) && !createdLocally)
          this._deletedLocally.push(item);
        this.deleted([{item$: entity$, item}]);
        if (index >= 0) {
          this._store.value.splice(index, 1);
          this._store.next(this._store.value);
        }
      },
      () => this.markDeletedInDb(item),
      status => this.updateStatusWithLocalDelete(status),
      ondone,
    );
  }

  public deleteIf(description: string, predicate: (item: STORE_ITEM) => boolean, ondone?: () => void): void {
    let items: STORE_ITEM[] = [];
    this.performOperation(
      'delete items if: ' + description,
      () => {
        const toDelete = this._store.value.filter(item$ => item$.value && predicate(item$.value));
        if (toDelete.length === 0) return;
        const deleted: {item$: BehaviorSubject<STORE_ITEM | null>, item: STORE_ITEM}[] = [];
        for (const item$ of toDelete) {
          const item = item$.value!;
          items.push(item);
          const created = this._createdLocally.indexOf(item$);
          if (created >= 0) this._createdLocally.splice(created, 1);
          if (!this._deletedLocally.includes(item) && created < 0)
            this._deletedLocally.push(item);
          item$.next(null);
          deleted.push({item$, item});
        }
        this.deleted(deleted);
        for (const item$ of toDelete) {
          const index = this._store.value.indexOf(item$);
          if (index >= 0) this._store.value.splice(index, 1);
        }
        this._store.next(this._store.value);
      },
      () => items.length === 0 ? of(true) : combineLatest(items.map(item => this.markDeletedInDb(item))),
      status => items.length === 0 ? false : this.updateStatusWithLocalDelete(status),
      ondone
    );
  }

  public lockItem(item: STORE_ITEM, onlocked: (locked: boolean, unlock: () => void) => void): void {
    const key = this.getKey(item);
    this._locks.lock(key, locked => {
      onlocked(locked, () => {
        this._locks.unlock(key);
      });
    });
  }

  public updateWithLock(item: STORE_ITEM, updater: (latestVersion: STORE_ITEM) => void, ondone?: (item: STORE_ITEM) => void) {
    this.lockItem(item, (locked, unlock) => {
      if (!locked) {
        if (ondone) ondone(item);
        return;
      }
      const latestItem = this._store.value.find(item$ => item$.value && this.areSame(item$.value, item))?.value;
      if (latestItem) {
        updater(latestItem);
        this.updateWithoutLock(latestItem, () => {
          unlock();
          if (ondone) ondone(latestItem);
        });
      } else {
        unlock();
        if (ondone) ondone(item);
      }
    });
  }

  public updateWithoutLock(item: STORE_ITEM, ondone?: () => void): void {
    const key = this.getKey(item);
    this.updated(item);
    this.performOperation(
      'update item',
      () => {
        const createdLocally = this._createdLocally.some(item$ => item$.value && this.areSame(item$.value, item));
        if (!createdLocally && !this._updatedLocally.includes(key))
          this._updatedLocally.push(key);
        const entity$ = this._store.value.find(item$ => item$.value && this.areSame(item$.value, item));
        entity$?.next(item);
      },
      () => this.markUpdatedInDb(item),
      status => this.updateStatusWithLocalUpdate(status),
      ondone
    );
  }

  protected dbOperation(name: string, op: () => Observable<any>): Observable<any> {
    const loaded = this._storeLoaded$.value;
    if (!loaded) return of(undefined);
    return new Observable(subscriber => {
      if (loaded != this._storeLoaded$.value) {
        subscriber.next(false);
        subscriber.complete();
        return;
      }
      this.performOperation(
        name,
        () => {},
        dbStatus => dbStatus.counter === loaded.counter ? op() : of(false),
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

  private hardDelete(): Observable<any> {
    return this.dbOperation('hard delete local data', () => this.table.deleteAll$());
  }

  protected async shouldForceUpdateFromServer() {
    const db = this.table.dbNow();
    if (!db) return false;
    const data = await db.readInternalData('store_' + this.table.name);
    return data?.['forceUpdateFromServer'] || false;
  }

  protected async markStoreToForceUpdateFromServer(force: boolean) {
    const db = this.table.dbNow();
    if (!db) return false;
    const key = 'store_' + this.table.name;
    const previousData = await db.readInternalData(key) || {};
    const newData = {...previousData, forceUpdateFromServer: force};
    return await db.setInternalData(key, newData);
  }

}
