import { BehaviorSubject, EMPTY, Observable, catchError, combineLatest, concat, defaultIfEmpty, filter, first, from, map, of, switchMap, tap } from 'rxjs';
import { Owned } from 'src/app/model/owned';
import { OwnedDto } from 'src/app/model/dto/owned';
import { Store, StoreSyncStatus } from './store';
import { Table } from 'dexie';
import { Injector } from '@angular/core';
import { ErrorService } from '../progress/error.service';
import { Console } from 'src/app/utils/console';
import { DependenciesService } from './dependencies.service';

export abstract class OwnedStore<DTO extends OwnedDto, ENTITY extends Owned> extends Store<ENTITY, StoredItem<DTO>, OwnedStoreSyncStatus> {

  private readonly _syncStatus$ = new BehaviorSubject<OwnedStoreSyncStatus>(new OwnedStoreSyncStatus());

  constructor(
    tableName: string,
    injector: Injector,
  ) {
    super(tableName, injector);
    this._initStore(tableName);
  }

  protected abstract fromDTO(dto: DTO): ENTITY;
  protected abstract toDTO(entity: ENTITY): DTO;

  protected abstract createOnServer(items: DTO[]): Observable<DTO[]>;
  protected abstract getUpdatesFromServer(knownItems: OwnedDto[]): Observable<UpdatesResponse<DTO>>;
  protected abstract sendUpdatesToServer(items: DTO[]): Observable<DTO[]>;
  protected abstract deleteFromServer(uuids: string[]): Observable<void>;

  public override get syncStatus$() { return this._syncStatus$; }
  public override get syncStatus() { return this._syncStatus$.value; }
  protected override set syncStatus(status: OwnedStoreSyncStatus) { this._syncStatus$.next(status); }

  protected override getKey(item: ENTITY): string {
    return item.uuid + '#' + item.owner;
  }

  protected override isCreatedLocally(item: StoredItem<DTO>): boolean {
    return item.item.version === 0;
  }

  protected override isDeletedLocally(item: StoredItem<DTO>): boolean {
    return item.item.version < 0;
  }

  protected override isUpdatedLocally(item: StoredItem<DTO>): boolean {
    return item.updatedLocally;
  }

  public itemUpdatedLocally(owner: string, uuid: string): boolean {
    return this._updatedLocally.indexOf(uuid + '#' + owner) >= 0;
  }

  public getNbLocalCreates(): number {
    return this._createdLocally.length;
  }

  protected override areSame(item1: ENTITY, item2: ENTITY): boolean {
    return item1.uuid === item2.uuid && item1.owner === item2.owner;
  }

  public getItem$(uuid: string, owner: string): Observable<ENTITY | null> {
    const known$ = this._store.value.find(item$ => item$.value?.uuid === uuid && item$.value?.owner === owner);
    if (known$) return known$;
    return concat(
      of(null),
      this._store.pipe(
        switchMap(items$ => {
          const item = items$.find(item$ => item$.value?.uuid === uuid && item$.value?.owner === owner);
          if (item) return item;
          return EMPTY;
        })
      )
    );
  }

  public getItem(uuid: string, owner: string): ENTITY | null {
    const item$ = this._store.value.find(item$ => item$.value?.uuid === uuid && item$.value?.owner === owner);
    return item$?.value ?? null;
  }

  protected override dbItemCreatedLocally(item: ENTITY): StoredItem<DTO> {
    return {id_owner: item.uuid + '#' + item.owner, item: this.toDTO(item), updatedLocally: false, localUpdate: Date.now()};
  }

  protected override updateStatusWithLocalCreate(status: OwnedStoreSyncStatus): boolean {
    if (status.localCreates) return false;
    status.localCreates = true;
    return true;
  }

  /** Called when items are deleted from the server. */
  protected signalDeleted(deleted: {uuid: string, owner: string}[]): void {
    // nothing by default
  }

  protected override markDeletedInDb(table: Table<StoredItem<DTO>, any, StoredItem<DTO>>, item: ENTITY): Observable<any> {
    item.markAsDeletedLocally();
    const dto = this.toDTO(item);
    const key = item.uuid + '#' + item.owner;
    return from(table.put({id_owner: key, item: dto, updatedLocally: false, localUpdate: Date.now()}));
  }

  protected override markUndeletedInDb(table: Table<StoredItem<DTO>, any, StoredItem<DTO>>, item: ENTITY): Observable<any> {
    return of(true); // not possible to create again exactly the same as an item deleted locally
  }

  protected override updateStatusWithLocalDelete(status: OwnedStoreSyncStatus): boolean {
    if (status.localDeletes) return false;
    status.localDeletes = true;
    return true;
  }

  public lock(uuid: string, owner: string, onlocked: (locked: boolean) => void): void {
    this._locks.lock(uuid + '#' + owner, onlocked);
  }

  public unlock(uuid: string, owner: string): void {
    this._locks.unlock(uuid + '#' + owner);
  }

  protected override updated(item: ENTITY): void {
    item.updatedAt = Date.now();
  }

  protected override markUpdatedInDb(table: Table<StoredItem<DTO>, any, StoredItem<DTO>>, item: ENTITY): Observable<any> {
    return from(table.put({id_owner: item.uuid + '#' + item.owner, item: this.toDTO(item), updatedLocally: true, localUpdate: Date.now()}))
  }

  protected override updateStatusWithLocalUpdate(status: OwnedStoreSyncStatus): boolean {
    if (status.localUpdates) return false;
    status.localUpdates = true;
    return true;
  }

  private updatedDtosFromServer(dtos: DTO[], deleted: {uuid: string; owner: string;}[] = []): Observable<boolean> {
    if (dtos.length === 0 && deleted.length === 0) return of(true);
    this._errors.itemsSuccess(dtos.map(dto => dto.uuid + '#' + dto.owner));
    this._errors.itemsSuccess(deleted.map(d => d.uuid + '#' + d.owner));
    const entitiesToAdd: BehaviorSubject<ENTITY | null>[] = [];
    const dtosToAdd: StoredItem<DTO>[] = [];
    const dtosToUpdate: StoredItem<DTO>[] = [];
    dtos.forEach(dto => {
      const key = dto.uuid + '#' + dto.owner;
      const entity = this.fromDTO(dto);
      const item$ = this._store.value.find(item$ => item$.value?.uuid === entity.uuid && item$.value?.owner === entity.owner);
      if (!item$) {
        if (this._deletedLocally.find(deleted => deleted.uuid === dto.uuid && deleted.owner === dto.owner)) {
          // updated from server, but deleted locally => ignore item from server
        } else {
          entitiesToAdd.push(new BehaviorSubject<ENTITY | null>(entity));
          dtosToAdd.push({id_owner: key, item: this.toDTO(entity), updatedLocally: false, localUpdate: Date.now()});
        }
      } else {
        dtosToUpdate.push({id_owner: key, item: this.toDTO(entity), updatedLocally: false, localUpdate: Date.now()});
        const updatedIndex = this._updatedLocally.indexOf(key);
        if (updatedIndex >= 0)
          this._updatedLocally.splice(updatedIndex, 1);
        const createdIndex = this._createdLocally.findIndex(item$ => item$.value!.uuid === dto.uuid && item$.value!.owner === dto.owner);
        if (createdIndex >= 0)
          this._createdLocally.splice(createdIndex, 1);
        item$.next(entity);
      }
    });
    this.injector.get(DependenciesService).operationDone(this.tableName, 'delete', deleted.map(d => d.uuid + '#' + d.owner));
    this.injector.get(DependenciesService).operationDone(this.tableName, 'update', dtosToUpdate.map(d => d.id_owner));
    const deletedKeys: string[] = [];
    const deletedItems: BehaviorSubject<ENTITY | null>[] = [];
    const callDeleted: {item$: BehaviorSubject<ENTITY | null>, item: ENTITY}[] = [];
    deleted.forEach(deletedItem => {
      const key = deletedItem.uuid + '#' + deletedItem.owner;
      deletedKeys.push(key);
      const localDeleteIndex = this._deletedLocally.findIndex(item => item.uuid === deletedItem.uuid && item.owner === deletedItem.owner);
      if (localDeleteIndex >= 0) {
        this._deletedLocally.splice(localDeleteIndex, 1);
      }
      const updatedIndex = this._updatedLocally.indexOf(key);
      if (updatedIndex >= 0)
        this._updatedLocally.splice(updatedIndex, 1);
      const item$ = this._store.value.find(item$ => item$.value?.uuid === deletedItem.uuid && item$.value?.owner === deletedItem.owner);
      if (item$) {
        deletedItems.push(item$);
        if (item$.value) callDeleted.push({item$, item: item$.value});
      }
    });
    if (callDeleted.length > 0)
      this.deleted(callDeleted);
    if (deleted.length > 0)
      this.signalDeleted(deleted);
    if (entitiesToAdd.length !== 0 || deletedItems.length !== 0) {
      for (const item$ of deletedItems) {
        const index = this._store.value.indexOf(item$);
        if (index >= 0) this._store.value.splice(index, 1);
      }
      this._store.value.push(...entitiesToAdd);
      this._store.next(this._store.value);
      deletedItems.forEach(item$ => item$.next(null));
    }
    return from(this._db!.transaction('rw', this.tableName, async tx => {
      const table = tx.db.table<StoredItem<DTO>>(this.tableName);
      if (dtosToAdd.length > 0)
        await table.bulkAdd(dtosToAdd);
      if (dtosToUpdate.length > 0)
        await table.bulkPut(dtosToUpdate);
      if (deletedKeys.length > 0)
        await table.bulkDelete(deletedKeys);
    })).pipe(defaultIfEmpty(true), map(() => true));
  }

  protected override close(): void {
    super.close();
  }

  protected override itemFromDb(item: StoredItem<DTO>): ENTITY {
    return this.fromDTO(item.item);
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
    this._syncStatus$.next(new OwnedStoreSyncStatus());
  }

  protected override sync(): Observable<boolean> {
    const db = this._db;
    return this._operationInProgress$.pipe(
      filter(p => {
        if (p) Console.info('Store ' + this.tableName + ' waiting for ' + this.operationsQueue$.value.length + ' operations to finish before sync');
        return !p;
      }),
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
        switchMap(() => {
          if (!stillValid()) return of(false);
          return this.syncLocalDeleteToServer(stillValid);
        }),
        switchMap(() => {
          if (!stillValid()) return of(false);
          return this.syncUpdateFromServer(stillValid);
        }),
        switchMap(() => {
          if (!stillValid()) return of(false);
          return this.syncUpdateToServer(stillValid);
        }),
        switchMap(() => {
          if (!stillValid()) return EMPTY;
          const status = this._syncStatus$.value;
          status.localCreates = this._createdLocally.length !== 0;
          status.localDeletes = this._deletedLocally.length !== 0;
          status.localUpdates = this._updatedLocally.length !== 0;
          status.quotaReached = this.isQuotaReached();
          status.inProgress = false;
          status.needsUpdateFromServer = false;
          status.lastUpdateFromServer = Date.now();
          Console.info('Store ' + this.tableName + ' sync: ' + (status.hasLocalChanges ? 'still ' + this._createdLocally.length + ' to create, ' + this._deletedLocally.length + ' to delete, ' + this._updatedLocally.length + ' to update' : 'no more local changes'))
          this._syncStatus$.next(status);
          const isIncomplete =
            this._createdLocally.filter(item => this._errors.canProcess(item.value?.uuid + '#' + item.value?.owner, true)).length > 0 ||
            this._deletedLocally.filter(item => this._errors.canProcess(item.uuid + '#' + item.owner, false)).length > 0 ||
            this._updatedLocally.filter(item => this._errors.canProcess(item, false)).length > 0;
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
    const canCreate = this._createdLocally.filter($item => !!$item.value && this._errors.canProcess($item.value.uuid + '#' + $item.value.owner, true));
    if (canCreate.length === 0) return of(true);
    const toCreate = canCreate.map(item$ => item$.value!).filter(item => this._locks.startSync(item.uuid + '#' + item.owner));
    const ready = toCreate.filter(entity => this.readyToSave(entity));
    const ready$ = ready.length > 0 ? of(ready) : this.waitReadyWithTimeout(toCreate)
    return ready$.pipe(
      switchMap(readyEntities => {
        const notReady = toCreate.filter(item => !readyEntities.find(entity => entity.uuid === item.uuid && entity.owner === item.owner));
        if (notReady.length > 0) {
          for (const item of notReady) this._locks.syncDone(item.uuid + '#' + item.owner);
          combineLatest(notReady.map(item => this.createdLocallyCanBeRemoved(item).pipe(map(remove => ({item, remove})))))
          .pipe(first())
          .subscribe(result => {
            for (const r of result) {
              if (r.remove) {
                const index = this._createdLocally.findIndex(c => !!c?.value && this.getKey(c.value) === this.getKey(r.item));
                if (index >= 0) this._createdLocally.splice(index, 1);
              }
            }
          });
        }
        if (readyEntities.length === 0) {
          Console.info('Nothing ready to create on server among ' + toCreate.length + ' element(s) of ' + this.tableName);
          return of(false);
        }
        return this.createOnServer(readyEntities.map(entity => this.toDTO(entity))).pipe(
          switchMap(result => {
            Console.info('' + result.length + '/' + readyEntities.length + ' ' + this.tableName + ' element(s) created on server, ' + notReady.length + ' waiting');
            if (!stillValid()) return of(false);
            return this.updatedDtosFromServer(result);
          }),
          catchError(error => {
            Console.error('Error creating ' + readyEntities.length + ' element(s) of ' + this.tableName + ' on server', error);
            this.injector.get(ErrorService).addNetworkError(error, 'errors.stores.create_items', [this.tableName]);
            this._errors.itemsError(readyEntities.map(e => e.uuid + '#' + e.owner), error);
            return of(false);
          }),
          tap(() => {
            for (const item of readyEntities) this._locks.syncDone(item.uuid + '#' + item.owner);
          })
        );
      }),
    );
  }

  private syncUpdateFromServer(stillValid: () => boolean): Observable<boolean> {
    if (!this._syncStatus$.value.needsUpdateFromServer) return of(true);
    const known = this._store.value.filter(item$ => this._createdLocally.indexOf(item$) < 0).map(item$ => item$.value).map(item => new Owned(item!).toDto()); // NOSONAR
    return this.getUpdatesFromServer(known).pipe(
      switchMap(result => {
        if (!stillValid()) return of(false);
        Console.info('Server updates for ' + this.tableName + ': sent ' + known.length + ' known element(s), received ' + result.deleted.length + ' deleted, ' + result.updated.length + ' updated, ' + result.created.length + ' created');
        return this.updatedDtosFromServer([...result.updated, ...result.created], result.deleted);
      }),
      catchError(error => {
        Console.error('Error requesting updates from server with ' + known.length + ' known element(s) of ' + this.tableName, error);
        this.injector.get(ErrorService).addNetworkError(error, 'errors.stores.get_updates', [this.tableName]);
        return of(false);
      })
    );
  }

  private syncUpdateToServer(stillValid: () => boolean): Observable<boolean> {
    let canUpdate = this._updatedLocally.filter(item => this._errors.canProcess(item, false));
    if (canUpdate.length === 0) return of(true);
    const toUpdate = this._store.value
      .map(item$ => item$.value)
      .filter(
        item => !!item &&
        canUpdate.indexOf(item.uuid + '#' + item.owner) >= 0 &&
        this._locks.startSync(item.uuid + '#' + item.owner)
      ) as ENTITY[];
    if (toUpdate.length === 0) return of(true);
    const ready = toUpdate.filter(entity => this.readyToSave(entity));
    const ready$ = ready.length > 0 ? of(ready) : this.waitReadyWithTimeout(toUpdate)
    return ready$.pipe(
      switchMap(readyEntities => {
        const notReady = toUpdate.filter(item => !readyEntities.find(entity => entity.uuid === item.uuid && entity.owner === item.owner));
        for (const item of notReady) this._locks.syncDone(item.uuid + '#' + item.owner);
        if (readyEntities.length === 0) {
          Console.info('Nothing ready to update on server among ' + toUpdate.length + ' element(s) of ' + this.tableName + ', ' + notReady.length + ' waiting');
          return of(false);
        }
        return this.sendUpdatesToServer(readyEntities.map(entity => this.toDTO(entity))).pipe(
          switchMap(result => {
            if (!stillValid()) return of(false);
            Console.info('' + result.length + '/' + readyEntities.length + ' ' + this.tableName + ' element(s) updated on server');
            const promises: Promise<any>[] = [];
            let notUpdated: string[] = [];
            for (const entity of readyEntities) {
              const updated = result.find(d => d.uuid === entity.uuid && d.owner === entity.owner);
              if (!updated) {
                // no update needed by the server: remove the updatedLocally from the DB
                notUpdated.push(entity.uuid + '#' + entity.owner);
                promises.push(this._db!.table<StoredItem<DTO>>(this.tableName).put({
                  id_owner: entity.uuid + '#' + entity.owner,
                  item: this.toDTO(entity),
                  updatedLocally: false,
                  localUpdate: Date.now(),
                }));
              }
              const index = this._updatedLocally.indexOf(entity.uuid + '#' + entity.owner);
              if (index >= 0) this._updatedLocally.splice(index, 1);
              this._errors.itemSuccess(entity.uuid + '#' + entity.owner);
            }
            this.injector.get(DependenciesService).operationDone(this.tableName, 'update', notUpdated);
            return from(Promise.all(promises)).pipe(
              switchMap(() => this.updatedDtosFromServer(result).pipe(map(ok => ok && readyEntities.length === toUpdate.length)))
            );
          }),
          catchError(error => {
            Console.error('Error updating ' + readyEntities.length + ' element(s) of ' + this.tableName + ' on server', error);
            this.injector.get(ErrorService).addNetworkError(error, 'errors.stores.send_updates', [this.tableName]);
            this._errors.itemsError(readyEntities.map(item => item.uuid + '#' + item.owner), error);
            return of(false);
          }),
          tap(() => {
            for (const item of readyEntities) this._locks.syncDone(item.uuid + '#' + item.owner);
          })
        );
      }),
    );
  }

  private syncLocalDeleteToServer(stillValid: () => boolean): Observable<boolean> {
    const toDelete = this._deletedLocally.filter(item => this._errors.canProcess(item.uuid + '#' + item.owner, false));
    if (toDelete.length === 0) return of(true);
    return from(this.injector.get(DependenciesService).canDo(this.tableName, 'delete', toDelete.map(item => item.uuid + '#' + item.owner))).pipe(
      switchMap(canDelete => {
        if (canDelete.length === 0) {
          Console.info('Nothing ready to be deleted among ' + toDelete.length + ' element(s) of ' + this.tableName);
          return of(false);
        }
        Console.info(canDelete.length + ' element(s) of ' + this.tableName + ' ready to be deleted on server');
        const uuids = canDelete.map(key => key.substring(0, key.indexOf('#')));
        return this.deleteFromServer(uuids).pipe(
          defaultIfEmpty(true),
          switchMap(() => {
            if (!stillValid()) return of(false);
            Console.info('' + canDelete.length + ' element(s) of ' + this.tableName + ' deleted on server');
            return this.updatedDtosFromServer([], canDelete.map(e => ({uuid: e.substring(0, e.indexOf('#')), owner: e.substring(e.indexOf('#') + 1)})));
          }),
          catchError(error => {
            Console.error('Error deleting element(s) of ' + this.tableName + ' on server', error);
            this.injector.get(ErrorService).addNetworkError(error, 'errors.stores.delete_items', [this.tableName]);
            this._errors.itemsError(canDelete, error);
            return of(false);
          })
        );
      }),
    );
  }

  protected getLocalUpdate(entity: ENTITY): Promise<number | undefined> {
    return this._db!.table<StoredItem<DTO>>(this.tableName).get(entity.uuid + '#' + entity.owner).then(item => item?.localUpdate);
  }

}

interface StoredItem<DTO> {
  id_owner: string;
  item: DTO;
  updatedLocally: boolean;
  localUpdate: number;
}

export interface UpdatesResponse<T> {

  deleted: {uuid: string; owner: string;}[];
  updated: T[];
  created: T[];

}

class OwnedStoreSyncStatus implements StoreSyncStatus {
  public localCreates = false;
  public localUpdates = false;
  public localDeletes = false;
  public needsUpdateFromServer = true;
  public lastUpdateFromServer?: number;
  public quotaReached = false;

  public inProgress = false;

  public get needsSync(): boolean { return (this.localCreates && !this.quotaReached) || this.localUpdates || this.localDeletes || this.needsUpdateFromServer; }
  public get hasLocalChanges(): boolean { return this.localCreates || this.localUpdates || this.localDeletes; }

}
