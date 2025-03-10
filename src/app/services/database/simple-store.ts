import { BehaviorSubject, EMPTY, Observable, catchError, defaultIfEmpty, filter, first, from, map, of, switchMap } from "rxjs";
import { Store, StoreSyncStatus } from "./store";
import { Table } from "dexie";
import { Injector } from "@angular/core";
import { ErrorService } from '../progress/error.service';
import { Console } from 'src/app/utils/console';

interface SimpleStoreItem<T> {
  key: string;
  item: T;
  createdLocally: boolean;
  deletedLocally: boolean;
}

export class SimpleStoreSyncStatus implements StoreSyncStatus {
  public localCreates = false;
  public localDeletes = false;
  public needsUpdateFromServer = true;
  public lastUpdateFromServer?: number;
  public quotaReached = false;

  public inProgress = false;

  public get needsSync(): boolean { return (this.localCreates && !this.quotaReached) || this.localDeletes || this.needsUpdateFromServer; }
  public get hasLocalChanges(): boolean { return this.localCreates || this.localDeletes; }
}

export abstract class SimpleStore<DTO, ENTITY> extends Store<ENTITY, SimpleStoreItem<DTO>, SimpleStoreSyncStatus> {

  private readonly _syncStatus$ = new BehaviorSubject<SimpleStoreSyncStatus>(new SimpleStoreSyncStatus());

  constructor(
    tableName: string,
    injector: Injector,
  ) {
    super(tableName, injector);
    this._initStore(tableName);
  }

  public override get syncStatus$() { return this._syncStatus$; }
  public override get syncStatus() { return this._syncStatus$.value; }
  protected override set syncStatus(status: SimpleStoreSyncStatus) { this._syncStatus$.next(status); }

  protected abstract fromDTO(dto: DTO): ENTITY;
  protected abstract toDTO(entity: ENTITY): DTO;
  protected abstract getKey(entity: ENTITY): string;

  protected abstract createOnServer(items: DTO[]): Observable<DTO[]>;
  protected abstract deleteFromServer(items: DTO[]): Observable<void>;
  protected abstract getAllFromServer(): Observable<DTO[]>;

  protected override itemFromDb(item: SimpleStoreItem<DTO>): ENTITY {
      return this.fromDTO(item.item);
  }

  protected override isCreatedLocally(item: SimpleStoreItem<DTO>): boolean {
    return item.createdLocally;
  }

  protected override isDeletedLocally(item: SimpleStoreItem<DTO>): boolean {
    return item.deletedLocally;
  }

  public getNbLocalCreates(): number {
    return this._createdLocally.length;
  }

  protected override areSame(item1: ENTITY, item2: ENTITY): boolean {
    return this.getKey(item1) === this.getKey(item2);
  }

  protected updateEntityFromServer(): boolean {
    return false;
  }

  private saveStore(): Observable<boolean> {
    return from(this._db!.transaction('rw', this.tableName, async tx => {
      const table = tx.db.table<SimpleStoreItem<DTO>>(this.tableName);
      await table.clear();
      const dbItems: SimpleStoreItem<DTO>[] = [];
      this._store.value.forEach(item$ => {
        if (item$.value) {
          dbItems.push({
            key: this.getKey(item$.value),
            item: this.toDTO(item$.value),
            createdLocally: this._createdLocally.indexOf(item$) >= 0,
            deletedLocally: false,
          });
        }
      });
      this._deletedLocally.forEach(item => {
        dbItems.push({
          key: this.getKey(item),
          item: this.toDTO(item),
          createdLocally: false,
          deletedLocally: true,
        })
      });
      await table.bulkAdd(dbItems);
    })).pipe(defaultIfEmpty(true), map(() => true));
  }

  protected override beforeEmittingStoreLoaded(): void {
    const status = this._syncStatus$.value;
    status.needsUpdateFromServer = true;
    status.inProgress = false;
    status.localCreates = this._createdLocally.length !== 0;
    status.localDeletes = this._deletedLocally.length !== 0;
    this._syncStatus$.next(this._syncStatus$.value);
  }

  protected override afterClosed(): void {
    this._syncStatus$.next(new SimpleStoreSyncStatus());
  }

  protected override dbItemCreatedLocally(item: ENTITY): SimpleStoreItem<DTO> {
    return {
      key: this.getKey(item),
      item: this.toDTO(item),
      createdLocally: true,
      deletedLocally: false,
    };
  }

  protected override updateStatusWithLocalCreate(status: SimpleStoreSyncStatus): boolean {
    if (status.localCreates) return false;
    status.localCreates = true;
    return true;
  }

  protected override markDeletedInDb(table: Table<SimpleStoreItem<DTO>, any, SimpleStoreItem<DTO>>, item: ENTITY): Observable<any> {
    const key = this.getKey(item);
    return from(this._db!.transaction('rw', table, () => {
      table.get(key).then(dbItem => {
        if (!dbItem) return Promise.resolve(true);
        if (dbItem.createdLocally) return table.delete(key);
        return table.put({...dbItem, deletedLocally: true}, key);
      });
    }));
  }

  protected override markUndeletedInDb(table: Table<SimpleStoreItem<DTO>, any, SimpleStoreItem<DTO>>, item: ENTITY): Observable<any> {
    const key = this.getKey(item);
    return from(this._db!.transaction('rw', table, () => {
      table.get(key).then(dbItem => {
        if (!dbItem) return Promise.resolve(true);
        return table.put({...dbItem, deletedLocally: false}, key);
      });
    }));
  }

  protected override updateStatusWithLocalDelete(status: SimpleStoreSyncStatus): boolean {
    if (status.localDeletes) return false;
    status.localDeletes = true;
    return true;
  }

  protected override sync(): Observable<boolean> {
    const db = this._db;
    return this._operationInProgress$.pipe(
      filter(p => !p),
      first(),
      switchMap(() => this._db === db ? this._sync() : EMPTY),
    );
  }

  private _sync(): Observable<boolean> {
    return this.ngZone.runOutsideAngular(() => {
      const db = this._db;
      const stillValid = () => this._db === db;

      this._syncStatus$.value.inProgress = true;
      this._syncStatus$.next(this._syncStatus$.value);

      return this.syncCreateNewItems(stillValid)
      .pipe(
        switchMap(result => {
          if (!stillValid()) return of(false);
          if (result && this._syncStatus$.value.localCreates) {
            this._syncStatus$.value.localCreates = false;
            this._syncStatus$.next(this._syncStatus$.value);
          }
          return this.syncLocalDeleteToServer(stillValid);
        }),
        switchMap(result => {
          if (!stillValid()) return of(false);
          if (result && this._syncStatus$.value.localDeletes) {
            this._syncStatus$.value.localDeletes = false;
            this._syncStatus$.next(this._syncStatus$.value);
          }
          return this.syncGetAllFromServer(stillValid);
        }),
        switchMap(result => {
          if (!stillValid()) return EMPTY;
          if (result) {
            this._syncStatus$.value.needsUpdateFromServer = false;
            this._syncStatus$.value.lastUpdateFromServer = Date.now();
          }
          this._syncStatus$.value.quotaReached = this.isQuotaReached();
          this._syncStatus$.value.inProgress = false;
          this._syncStatus$.next(this._syncStatus$.value);
          const isIncomplete =
            this._createdLocally.filter(item => item.value && this._errors.canProcess(this.getKey(item.value), true)).length > 0 ||
            this._deletedLocally.filter(item => this._errors.canProcess(this.getKey(item), false)).length > 0;
          return of(isIncomplete);
        }),
        catchError(error => {
          // should never happen
          Console.error(error);
          return of(false);
        }),
      );
    });
  }

  private syncCreateNewItems(stillValid: () => boolean): Observable<boolean> {
    if (this._createdLocally.length === 0) return of(true);
    const toCreate = this._createdLocally.filter(item$ => !!item$.value).map(item$ => item$.value!).filter(item => this._errors.canProcess(this.getKey(item), true));
    if (toCreate.length === 0) return of(true);
    const ready = toCreate.filter(entity => this.readyToSave(entity));
    const ready$ = ready.length > 0 ? of(ready) : this.waitReadyWithTimeout(toCreate)
    return ready$.pipe(
      switchMap(readyEntities => {
        if (readyEntities.length === 0) {
          Console.info('Nothing ready to create on server among ' + toCreate.length + ' element(s) of ' + this.tableName);
          return of(false);
        }
        return this.createOnServer(readyEntities.map(entity => this.toDTO(entity))).pipe(
          switchMap(result => {
            Console.info('' + result.length + '/' + readyEntities.length + ' ' + this.tableName + ' element(s) created on server, ' + (toCreate.length - readyEntities.length) + ' additional pending');
            if (!stillValid()) return of(false);
            result.forEach(created => {
              const entity = this.fromDTO(created);
              const index = this._createdLocally.findIndex(item$ => item$.value && this.areSame(entity, item$.value));
              if (index >= 0) this._createdLocally.splice(index, 1);
              this._errors.itemSuccess(this.getKey(entity));
            });
            this._syncStatus$.value.localCreates = this._createdLocally.length !== 0;
            return this.saveStore().pipe(map(ok => ok && readyEntities.length === toCreate.length));
          }),
          catchError(error => {
            Console.error('Error creating ' + readyEntities.length + ' element(s) of ' + this.tableName + ' on server', error);
            this.injector.get(ErrorService).addNetworkError(error, 'errors.stores.create_items', [this.tableName]);
            this._errors.itemsError(readyEntities.map(e => this.getKey(e)), error);
            return of(false);
          })
        );
      }),
    );
  }

  private syncLocalDeleteToServer(stillValid: () => boolean): Observable<boolean> {
    if (this._deletedLocally.length === 0) return of(true);
    const toDelete = [...this._deletedLocally.filter(item => this._errors.canProcess(this.getKey(item), false))];
    if (toDelete.length === 0) return of(true);
    return this.deleteFromServer(toDelete.map(entity => this.toDTO(entity))).pipe(
      defaultIfEmpty(true),
      switchMap(() => {
        if (!stillValid()) return of(false);
        toDelete.forEach(entity => {
          const index = this._deletedLocally.indexOf(entity);
          if (index >= 0) this._deletedLocally.splice(index, 1);
          this._errors.itemSuccess(this.getKey(entity));
        });
        this._syncStatus$.value.localDeletes = this._deletedLocally.length !== 0;
        Console.info('' + toDelete.length + ' element(s) of ' + this.tableName + ' deleted on server');
        return this.saveStore();
      }),
      catchError(error => {
        Console.error('Error deleting ' + toDelete.length + ' element(s) of ' + this.tableName + ' on server', error);
        this.injector.get(ErrorService).addNetworkError(error, 'errors.stores.delete_items', [this.tableName]);
        this._errors.itemsError(toDelete.map(e => this.getKey(e)), error);
        return of(false);
      })
    );
  }

  private syncGetAllFromServer(stillValid: () => boolean): Observable<boolean> {
    return this.getAllFromServer().pipe(
      switchMap(dtos => {
        if (!stillValid()) return of(false);
        const returnedFromServer = dtos.length;
        // remove items not created locally and not returned by the server, and add new items from server
        const deleted: BehaviorSubject<ENTITY | null>[] = [];
        this._store.value.forEach(
          item$ => {
            if (!item$.value) return;
            const index = dtos.findIndex(dto => this.areSame(this.fromDTO(dto), item$.value!)); // NOSONAR
            if (index >= 0) {
              // returned by server => already known
              if (this.updateEntityFromServer()) {
                const dto = dtos[index];
                const entity = this.fromDTO(dto);
                item$.next(entity);
                this._errors.itemSuccess(this.getKey(entity));
              }
              dtos.splice(index, 1);
            } else if (this._createdLocally.indexOf(item$) < 0) {
              // not returned by the server
              // not created locally => removed from server
              deleted.push(item$);
              this._errors.itemSuccess(this.getKey(item$.value));
            }
          }
        );
        const added: BehaviorSubject<ENTITY | null>[] = [];
        dtos.forEach(dto => {
          const e = this.fromDTO(dto);
          if (!this._deletedLocally.find(entity => this.areSame(e, entity))) {
            // not deleted locally => new item from server
            added.push(new BehaviorSubject<ENTITY | null>(this.fromDTO(dto)));
          }
        });
        Console.info('Server updates for ' + this.tableName + ': ' + added.length + ' new items, ' + deleted.length + ' deleted items, ' + (returnedFromServer - added.length) + ' known items');
        if (deleted.length > 0 || added.length > 0) {
          for (const item$ of deleted) {
            const index = this._store.value.indexOf(item$);
            if (index >= 0) this._store.value.splice(index, 1);
          }
          this._store.value.push(...added);
          this._store.next(this._store.value);
          return this.saveStore();
        }
        return of(true);
      }),
      catchError(error => {
        Console.error('Error getting updates from server for ' + this.tableName, error);
        this.injector.get(ErrorService).addNetworkError(error, 'errors.stores.get_updates', [this.tableName]);
        return of(false);
      })
    );
  }
}
