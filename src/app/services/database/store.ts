import { BehaviorSubject, EMPTY, Observable, catchError, combineLatest, debounceTime, defaultIfEmpty, filter, first, firstValueFrom, from, map, of, switchMap, timeout } from "rxjs";
import { DatabaseService, VersionedDb } from "./database.service";
import Dexie, { Table } from "dexie";
import { Injector, NgZone } from "@angular/core";
import { SynchronizationLocks } from './synchronization-locks';
import { Console } from 'src/app/utils/console';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { StoreErrors } from './store-errors';
import { trailenceAppVersionCode } from 'src/app/trailence-version';

export interface StoreSyncStatus {

    get needsSync(): boolean;
    get hasLocalChanges(): boolean;

    inProgress: boolean;
    needsUpdateFromServer: boolean;
    lastUpdateFromServer?: number;
}

const DEBUG_OPERATIONS = false;

export abstract class Store<STORE_ITEM, DB_ITEM, SYNCSTATUS extends StoreSyncStatus> {

  protected _db?: Dexie;
  protected ngZone: NgZone;

  protected _store = new BehaviorSubject<BehaviorSubject<STORE_ITEM | null>[]>([]);
  protected _createdLocally: BehaviorSubject<STORE_ITEM | null>[] = [];
  protected _deletedLocally: STORE_ITEM[] = [];
  protected _updatedLocally: string[] = [];
  protected _errors: StoreErrors;
  protected _locks = new SynchronizationLocks();

  private readonly _storeLoaded$ = new BehaviorSubject<boolean>(false);

  protected readonly _operationInProgress$ = new BehaviorSubject<boolean>(false);

  constructor(
    protected tableName: string,
    protected injector: Injector,
  ) {
    this.ngZone = injector.get(NgZone);
    this._errors = new StoreErrors(injector, tableName, () => this.isQuotaReached());
  }

  public get loaded$() { return this._storeLoaded$; }

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

  protected _initStore(name: string): void {
    const dbService = this.injector.get(DatabaseService);
    dbService.registerStore({
      name,
      status$: this.syncStatus$,
      loaded$: this._storeLoaded$,
      hasPendingOperations$: combineLatest([this._operationInProgress$, this.operationsQueue$]).pipe(map(([progress, queue]) => progress || queue.length > 0)),
      syncFromServer: () => this.triggerSyncFromServer(),
      fireSyncStatus: () => this.syncStatus = this.syncStatus, // NOSONAR
      doSync: () => this.sync(),
      resetErrors: () => this._errors.reset(),
    });
    // listen to database change (when authentication changed)
    dbService.db$.subscribe(db => {
      if (db) this.load(dbService, db);
      else this.close();
    });
  }

  public triggerSyncFromServer(): void {
    const db = this._db;
    this._storeLoaded$.pipe(
      filterDefined(),
      first()
    ).subscribe(() => {
      if (this._db === db && db)
        this.performOperation(
          'trigger sync from server',
          () => false,
          () => of(true),
          status => {
            status.needsUpdateFromServer = true;
            return true;
          }
        );
    });
  }

  public abstract get syncStatus$(): Observable<SYNCSTATUS>;
  public abstract get syncStatus(): SYNCSTATUS;
  protected abstract set syncStatus(status: SYNCSTATUS);

  protected abstract migrate(fromVersion: number, dbService: DatabaseService): Promise<number | undefined>;

  protected abstract itemFromDb(item: DB_ITEM): STORE_ITEM;
  protected abstract areSame(item1: STORE_ITEM, item2: STORE_ITEM): boolean;
  protected abstract getKey(item: STORE_ITEM): string;

  protected abstract sync(): Observable<boolean>;

  protected close(): void {
    if (!this._db) return;
    this.ngZone.runOutsideAngular(() => {
      this._errors.reset();
      this._locks = new SynchronizationLocks();
      this._db = undefined;
      this._storeLoaded$.next(false);
      const items = this._store.value;
      this._store.next([]);
      this._createdLocally = [];
      this._deletedLocally = [];
      this._updatedLocally = [];
      items.forEach(item$ => item$.complete());
      this.afterClosed();
    });
  }

  private load(dbService: DatabaseService, db: VersionedDb): void {
    if (this._db) this.close();
    this.ngZone.runOutsideAngular(() => {
      this.migrateIfNeeded(dbService, db.tablesVersion[this.tableName] ?? trailenceAppVersionCode)
      .then(() => {
        if (dbService.db !== db) return;
        this._db = db.db;
        this._locks = new SynchronizationLocks();
        from(db.db.table<DB_ITEM>(this.tableName).toArray()).subscribe({
          next: items => {
            if (this._db !== db.db) return;
            const newStore: BehaviorSubject<STORE_ITEM | null>[] = [];
            items.forEach(dbItem => {
              const item = this.itemFromDb(dbItem);
              if (this.isDeletedLocally(dbItem)) this._deletedLocally.push(item);
              else {
                const item$ = new BehaviorSubject<STORE_ITEM | null>(item);
                if (this.isCreatedLocally(dbItem)) this._createdLocally.push(item$);
                else if (this.isUpdatedLocally(dbItem)) this._updatedLocally.push(this.getKey(item));
                newStore.push(item$);
              }
            });
            this._store.next(newStore);
            this.beforeEmittingStoreLoaded();
            this._storeLoaded$.next(true);
          },
          error: e => {
            Console.error('Error loading store ' + this.tableName, e);
          }
        });
      });
    });
  }

  private migrateIfNeeded(dbService: DatabaseService, currentVersion: number): Promise<void> {
    if (currentVersion >= trailenceAppVersionCode) return Promise.resolve();
    return this.migrate(currentVersion, dbService)
    .then(migrationResult => {
      const newVersion = migrationResult ?? trailenceAppVersionCode;
      return dbService.saveTableVersion(this.tableName, newVersion)
      .then(() => this.migrateIfNeeded(dbService, newVersion));
    });
  }

  protected beforeEmittingStoreLoaded(): void {
    // nothing by default
  }

  protected abstract afterClosed(): void;

  protected readonly operationsQueue$ = new BehaviorSubject<((resolve: (done: boolean) => void) => void)[]>([]);

  protected performOperation(
    description: string,
    storeUpdater: () => void,
    tableUpdater: (db: Dexie) => Observable<any>,
    statusUpdater: (status: SYNCSTATUS) => boolean,
    ondone?: () => void,
    oncancelled?: () => void,
  ): void {
    const db = this._db!;
    const operationExecution = (resolve: (done: boolean) => void) => {
      if (DEBUG_OPERATIONS) Console.debug('Operation on store ' + this.tableName + ': ' + description);
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
    };
    this.operationsQueue$.value.push(operationExecution);
    if (this._operationInProgress$.value) return;
    if (this._storeLoaded$.value) {
      this.launchOperationQueue();
      return;
    }
    if (this.operationsQueue$.value.length === 1) {
      this.operationsQueue$.next(this.operationsQueue$.value);
      this._storeLoaded$.pipe(
        filter(loaded => loaded),
        first()
      ).subscribe(() => this.launchOperationQueue());
    }
  }

  private launchOperationQueue(): void {
    this._operationInProgress$.next(true);
    this.operationsQueue$.next(this.operationsQueue$.value);
    this.ngZone.runOutsideAngular(() => {
      this.syncStatus$.pipe(
        filter(s => !s.inProgress),
        first(),
      ).subscribe(() => setTimeout(() => this.executeNextOperation(Date.now(), 0), 0));
    });
  }

  private executeNextOperation(startTime: number, deep: number): void {
    if (this.operationsQueue$.value.length === 0) {
      this._operationInProgress$.next(false);
      return;
    }
    const operation = this.operationsQueue$.value.splice(0, 1)[0];
    operation(() => {
      this.ngZone.runOutsideAngular(() => {
        this.operationsQueue$.next(this.operationsQueue$.value);
        if (Date.now() - startTime > 1000 || deep > 100) {
          Console.info('Store ' + this.tableName + ': still ' + this.operationsQueue$.value.length + ' operations pending');
          setTimeout(() => this.executeNextOperation(Date.now(), 0), 0);
        } else
          this.executeNextOperation(startTime, deep + 1);
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
    let recovered = false;
    this.performOperation(
      'create item',
      () => {
        existing = !!this._store.value.find(value => value.value && this.areSame(value.value, item));
        if (!existing) {
          const deleted = this._deletedLocally.findIndex(value => this.areSame(value, item));
          if (deleted < 0) {
            this._createdLocally.push(item$);
            this._store.value.push(item$);
            this._store.next(this._store.value);
          } else {
            this._deletedLocally.splice(deleted, 1);
            this._store.value.push(item$);
            this._store.next(this._store.value);
            recovered = true;
          }
        }
      },
      db => existing ? of(true)
        : recovered ? this.markUndeletedInDb(db.table<DB_ITEM>(this.tableName), item)
        : from(db.table<DB_ITEM>(this.tableName).add(this.dbItemCreatedLocally(item))),
      status => {
        if (existing || recovered) return false;
        return this.updateStatusWithLocalCreate(status);
      },
      ondone
    );
    return item$;
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
          const existing = !!this._store.value.find(value => value.value && this.areSame(value.value, item));
          let recovered = false;
          if (!existing) {
            const item$ = new BehaviorSubject<STORE_ITEM | null>(item);
            const deleted = this._deletedLocally.findIndex(value => this.areSame(value, item));
            if (deleted < 0) {
              this._createdLocally.push(item$);
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
          else if (recovered) recoveredList.push(item);
          else nbNew++;
        }
        if (storeChanged) this._store.next(this._store.value);
      },
      db => {
        return from(db.transaction('rw', this.tableName, async () => {
          const table = db.table<DB_ITEM>(this.tableName);
          const toAdd: DB_ITEM[] = [];
          for (const item of items) {
            if (existingList.indexOf(item) >= 0) continue;
            if (recoveredList.indexOf(item) >= 0) await firstValueFrom(this.markUndeletedInDb(table, item));
            else toAdd.push(this.dbItemCreatedLocally(item));
          }
          if (toAdd.length > 0)
            await table.bulkAdd(toAdd);
        }));
      },
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

  protected abstract markDeletedInDb(table: Table<DB_ITEM>, item: STORE_ITEM): Observable<any>;
  protected abstract markUndeletedInDb(table: Table<DB_ITEM>, item: STORE_ITEM): Observable<any>;
  protected abstract markUpdatedInDb(table: Table<DB_ITEM>, item: STORE_ITEM): Observable<any>;

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
        if (this._deletedLocally.indexOf(item) < 0 && !createdLocally)
          this._deletedLocally.push(item);
        this.deleted([{item$: entity$, item}]);
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

  public deleteIf(description: string, predicate: (item: STORE_ITEM) => boolean, ondone?: () => void): void {
    let items: STORE_ITEM[] = [];
    this.performOperation(
      'delete items if: ' + description,
      () => {
        const toDelete = this._store.value.filter(item$ => item$.value && predicate(item$.value));
        if (toDelete.length === 0) return;
        const deleted: {item$: BehaviorSubject<STORE_ITEM | null>, item: STORE_ITEM}[] = [];
        toDelete.forEach(item$ => {
          const item = item$.value!;
          items.push(item);
          const created = this._createdLocally.indexOf(item$);
          if (created >= 0) this._createdLocally.splice(created, 1);
          if (this._deletedLocally.indexOf(item) < 0 && created < 0)
            this._deletedLocally.push(item);
          item$.next(null);
          deleted.push({item$, item});
        });
        this.deleted(deleted);
        toDelete.forEach(item$ => {
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
        const createdLocally = this._createdLocally.find(item$ => item$.value && this.areSame(item$.value, item));
        if (!createdLocally && this._updatedLocally.indexOf(key) < 0)
          this._updatedLocally.push(key);
        const entity$ = this._store.value.find(item$ => item$.value && this.areSame(item$.value, item));
        entity$?.next(item);
      },
      db => this.markUpdatedInDb(db.table<DB_ITEM>(this.tableName), item),
      status => this.updateStatusWithLocalUpdate(status),
      ondone
    );
  }

  public cleanDatabase(db: Dexie, email: string): Observable<any> {
    return new Observable(subscriber => {
      const dbService = this.injector.get(DatabaseService);
      if (db !== dbService.db?.db || email !== dbService.email) {
        subscriber.next(false);
        subscriber.complete();
        return;
      }
      this.performOperation(
        'database cleaning',
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
