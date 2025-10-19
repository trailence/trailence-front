import { BehaviorSubject, EMPTY, Observable, catchError, defaultIfEmpty, from, map, of, switchMap } from "rxjs";
import { Store, StoreSyncStatus } from "./store";
import { Table } from "dexie";
import { Injector } from "@angular/core";
import { ErrorService } from '../progress/error.service';
import { Console } from 'src/app/utils/console';

export interface SimpleStoreItem<T> {
  key: string;
  item: T;
  createdLocally: boolean;
  deletedLocally: boolean;
  updatedLocally: boolean;
}

export class SimpleStoreSyncStatus implements StoreSyncStatus {
  public localCreates = false;
  public localDeletes = false;
  public localUpdates = false;
  public needsUpdateFromServer = true;
  public lastUpdateFromServer?: number;
  public quotaReached = false;

  public inProgress = false;

  public get needsSync(): boolean { return (this.localCreates && !this.quotaReached) || this.localDeletes || this.localUpdates || this.needsUpdateFromServer; }
  public get hasLocalChanges(): boolean { return this.localCreates || this.localDeletes || this.localUpdates; }
}

export abstract class SimpleStore<DTO, ENTITY> extends Store<ENTITY, SimpleStoreItem<DTO>, SimpleStoreSyncStatus> {

  constructor(
    tableName: string,
    injector: Injector,
  ) {
    super(tableName, injector, new SimpleStoreSyncStatus());
    this._initStore(tableName);
  }

  protected abstract fromDTO(dto: DTO): ENTITY;
  protected abstract toDTO(entity: ENTITY): DTO;

  protected abstract createOnServer(items: DTO[]): Observable<DTO[]>;
  protected abstract deleteFromServer(items: DTO[]): Observable<void>;
  protected abstract getAllFromServer(): Observable<DTO[]>;
  protected abstract updateToServer(items: DTO[]): Observable<DTO[]>;

  protected override itemFromDb(item: SimpleStoreItem<DTO>): ENTITY {
      return this.fromDTO(item.item);
  }

  protected override isCreatedLocally(item: SimpleStoreItem<DTO>): boolean {
    return item.createdLocally;
  }

  protected override isDeletedLocally(item: SimpleStoreItem<DTO>): boolean {
    return item.deletedLocally;
  }

  protected override isUpdatedLocally(item: SimpleStoreItem<DTO>): boolean {
    return item.updatedLocally;
  }

  public getNbLocalCreates(): number {
    return this._createdLocally.length;
  }

  protected override areSame(item1: ENTITY, item2: ENTITY): boolean {
    return this.getKey(item1) === this.getKey(item2);
  }

  protected updateEntityFromServer(fromServer: ENTITY, inStore: ENTITY): ENTITY | null {
    return null;
  }

  private saveStore(): Observable<boolean> {
    return from(this._db!.transaction('rw', this.tableName, async tx => {
      const table = tx.db.table<SimpleStoreItem<DTO>>(this.tableName);
      await table.clear();
      const dbItems: SimpleStoreItem<DTO>[] = [];
      for (const item$ of this._store.value) {
        if (item$.value) {
          const key = this.getKey(item$.value);
          dbItems.push({
            key: key,
            item: this.toDTO(item$.value),
            createdLocally: this._createdLocally.includes(item$),
            updatedLocally: this._updatedLocally.includes(key),
            deletedLocally: false,
          });
        }
      }
      for (const item of this._deletedLocally) {
        dbItems.push({
          key: this.getKey(item),
          item: this.toDTO(item),
          createdLocally: false,
          updatedLocally: false,
          deletedLocally: true,
        })
      }
      await table.bulkAdd(dbItems);
    })).pipe(defaultIfEmpty(true), map(() => true));
  }

  protected override beforeEmittingStoreLoaded(): void {
    const status = this._syncStatus$.value;
    status.needsUpdateFromServer = true;
    status.inProgress = false;
    status.localCreates = this._createdLocally.length !== 0;
    status.localDeletes = this._deletedLocally.length !== 0;
    status.localUpdates = this._updatedLocally.length !== 0;
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
      updatedLocally: false,
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
        if (!dbItem) return true;
        if (dbItem.createdLocally) return table.delete(key);
        return table.put({...dbItem, deletedLocally: true}, key);
      });
    }));
  }

  protected override markUndeletedInDb(table: Table<SimpleStoreItem<DTO>, any, SimpleStoreItem<DTO>>, item: ENTITY): Observable<any> {
    const key = this.getKey(item);
    return from(this._db!.transaction('rw', table, () => {
      table.get(key).then(dbItem => {
        if (!dbItem) return true;
        return table.put({...dbItem, deletedLocally: false, createdLocally: true}, key);
      });
    }));
  }

  protected override markUpdatedInDb(table: Table<SimpleStoreItem<DTO>, any, SimpleStoreItem<DTO>>, item: ENTITY): Observable<any> {
    const key = this.getKey(item);
    return from(this._db!.transaction('rw', table, () => {
      table.get(key).then(dbItem => {
        if (!dbItem) return true;
        return table.put({...dbItem, updatedLocally: true}, key);
      });
    }));
  }

  protected override updateStatusWithLocalDelete(status: SimpleStoreSyncStatus): boolean {
    if (status.localDeletes) return false;
    status.localDeletes = true;
    return true;
  }

  protected override updateStatusWithLocalUpdate(status: SimpleStoreSyncStatus): boolean {
    if (status.localUpdates) return false;
    status.localUpdates = true;
    return true;
  }

  protected override sync(): Observable<boolean> {
    const db = this._db;
    this.startSync();
    this.syncStep('waiting operations');
    return this.operations.requestSync(() => this._db === db ? this._sync() : EMPTY);
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
          if (!stillValid() || this.operations.pendingOperations > 0) return of(false);
          if (result && this._syncStatus$.value.localCreates) {
            this._syncStatus$.value.localCreates = false;
            this._syncStatus$.next(this._syncStatus$.value);
          }
          return this.syncLocalDeleteToServer(stillValid);
        }),
        switchMap(result => {
          if (!stillValid() || this.operations.pendingOperations > 0) return of(false);
          if (result && this._syncStatus$.value.localDeletes) {
            this._syncStatus$.value.localDeletes = false;
            this._syncStatus$.next(this._syncStatus$.value);
          }
          this.syncStep('request all items from server');
          return this.syncGetAllFromServer(stillValid);
        }),
        switchMap(result => {
          if (!stillValid() || this.operations.pendingOperations > 0) return of(false);
          if (result) {
            this._syncStatus$.value.needsUpdateFromServer = false;
            this._syncStatus$.value.lastUpdateFromServer = Date.now();
          }
          return this.syncLocalUpdateToServer(stillValid);
        }),
        defaultIfEmpty(false),
        switchMap(result => {
          if (stillValid()) this.syncEnd();
          if (result && this._syncStatus$.value.localUpdates) {
            this._syncStatus$.value.localUpdates = false;
          }
          this._syncStatus$.value.quotaReached = this.isQuotaReached();
          this._syncStatus$.value.inProgress = false;
          this._syncStatus$.next(this._syncStatus$.value);
          if (!stillValid()) return EMPTY;
          const isIncomplete =
            this._createdLocally.some(item => item.value && this._errors.canProcess(this.getKey(item.value), true)) ||
            this._updatedLocally.some(item => this._errors.canProcess(item, false)) ||
            this._deletedLocally.some(item => this._errors.canProcess(this.getKey(item), false));
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
    this.syncStep('create local new items to server');
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
            for (const created of result) {
              const entity = this.fromDTO(created);
              const index = this._createdLocally.findIndex(item$ => item$.value && this.areSame(entity, item$.value));
              if (index >= 0) this._createdLocally.splice(index, 1);
              this._errors.itemSuccess(this.getKey(entity));
            }
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
    const toDelete = this._deletedLocally.filter(item => this._errors.canProcess(this.getKey(item), false));
    if (toDelete.length === 0) return of(true);
    this.syncStep('send deleted local items to server');
    return this.deleteFromServer(toDelete.map(entity => this.toDTO(entity))).pipe(
      defaultIfEmpty(true),
      switchMap(() => {
        if (!stillValid()) return of(false);
        for (const entity of toDelete) {
          const index = this._deletedLocally.indexOf(entity);
          if (index >= 0) this._deletedLocally.splice(index, 1);
          this._errors.itemSuccess(this.getKey(entity));
        }
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

  private syncLocalUpdateToServer(stillValid: () => boolean): Observable<boolean> {
    if (this._updatedLocally.length === 0) return of(true);
    const toUpdate = this._updatedLocally.filter(item => this._errors.canProcess(item, false));
    if (toUpdate.length === 0) return of(true);
    this.syncStep('send local updates to server');
    const entities = this._store.value.filter(item$ => item$.value && toUpdate.includes(this.getKey(item$.value))).map(item$ => item$.value!);
    const ready = entities.filter(entity => this.readyToSave(entity));
    const ready$ = ready.length > 0 ? of(ready) : this.waitReadyWithTimeout(entities)
    return ready$.pipe(
      switchMap(readyEntities => {
        if (readyEntities.length === 0) {
          Console.info('Nothing ready to update on server among ' + entities.length + ' element(s) of ' + this.tableName);
          return of(false);
        }
        return this.updateToServer(readyEntities.map(entity => this.toDTO(entity))).pipe(
          switchMap(result => {
            Console.info('' + result.length + '/' + readyEntities.length + ' ' + this.tableName + ' element(s) updated on server, ' + (entities.length - readyEntities.length) + ' additional pending');
            if (!stillValid()) return of(false);
            const updatedEntities = result.map(dto => this.fromDTO(dto));
            for (const previousEntity of readyEntities) {
              const updated = updatedEntities.find(e => this.areSame(e, previousEntity));
              const key = this.getKey(previousEntity);
              const index = this._updatedLocally.indexOf(key);
              if (index >= 0) this._updatedLocally.splice(index, 1);
              this._errors.itemSuccess(key);
              const item$ = this._store.value.find(item$ => item$.value && this.areSame(item$.value, previousEntity));
              if (item$ && updated)
                item$.next(updated);
            }
            this._syncStatus$.value.localUpdates = this._updatedLocally.length !== 0;
            return this.saveStore().pipe(map(ok => ok && readyEntities.length === entities.length));
          }),
          catchError(error => {
            Console.error('Error updating ' + readyEntities.length + ' element(s) of ' + this.tableName + ' on server', error);
            this.injector.get(ErrorService).addNetworkError(error, 'errors.stores.send_updates', [this.tableName]);
            this._errors.itemsError(readyEntities.map(e => this.getKey(e)), error);
            return of(false);
          })
        );
      }),
    );
  }

  private syncGetAllFromServer(stillValid: () => boolean): Observable<boolean> {
    return this.getAllFromServer().pipe(
      switchMap(dtos => { // NOSONAR
        if (!stillValid()) return of(false);
        const returnedFromServer = dtos.length;
        // remove items not created locally and not returned by the server, and add new items from server
        const deleted: BehaviorSubject<ENTITY | null>[] = [];
        let updated = false;
        for (const item$ of this._store.value) {
          if (!item$.value) continue;
          const known = item$.value;
          const index = dtos.findIndex(dto => this.areSame(this.fromDTO(dto), known)); // NOSONAR
          if (index >= 0) {
            // returned by server => already known
            const dto = dtos[index];
            const entity = this.updateEntityFromServer(this.fromDTO(dto), known);
            if (entity) {
              item$.next(entity);
              this._errors.itemSuccess(this.getKey(entity));
              updated = true;
            }
            dtos.splice(index, 1);
          } else if (!this._createdLocally.includes(item$)) {
            // not returned by the server
            // not created locally => removed from server
            deleted.push(item$);
            this._errors.itemSuccess(this.getKey(known));
          }
        }
        const added: BehaviorSubject<ENTITY | null>[] = [];
        for (const dto of dtos) {
          const e = this.fromDTO(dto);
          if (!this._deletedLocally.some(entity => this.areSame(e, entity))) {
            // not deleted locally => new item from server
            added.push(new BehaviorSubject<ENTITY | null>(e));
          }
        }
        Console.info('Server updates for ' + this.tableName + ': ' + added.length + ' new items, ' + deleted.length + ' deleted items, ' + (returnedFromServer - added.length) + ' known items');
        if (deleted.length > 0 || added.length > 0 || updated) {
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
