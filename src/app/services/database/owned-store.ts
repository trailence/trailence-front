import { BehaviorSubject, EMPTY, Observable, catchError, concat, defaultIfEmpty, from, map, of, switchMap, tap } from 'rxjs';
import { Owned } from 'src/app/model/owned';
import { OwnedDto } from 'src/app/model/dto/owned';
import { Store, StoreSyncStatus } from './store';
import { Table } from 'dexie';
import { Injector } from '@angular/core';
import { DatabaseService } from './database.service';
import { ErrorService } from '../progress/error.service';


export abstract class OwnedStore<DTO extends OwnedDto, ENTITY extends Owned> extends Store<ENTITY, StoredItem<DTO>, OwnedStoreSyncStatus> {

  private _updatedLocally: string[] = [];
  private _syncStatus$ = new BehaviorSubject<OwnedStoreSyncStatus>(new OwnedStoreSyncStatus());

  constructor(
    tableName: string,
    injector: Injector,
  ) {
    super(tableName, injector);
    this._initStore();
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

  protected override isCreatedLocally(item: StoredItem<DTO>): boolean {
    return item.item.version === 0;
  }

  protected override isDeletedLocally(item: StoredItem<DTO>): boolean {
    return item.item.version < 0;
  }

  protected override areSame(item1: ENTITY, item2: ENTITY): boolean {
    return item1.uuid === item2.uuid && item1.owner === item2.owner;
  }

  protected override fireSync(): void {
    this._syncStatus$.value.needsUpdateFromServer = true;
    this._syncStatus$.next(this._syncStatus$.value);
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

  protected override deleted(item$: BehaviorSubject<ENTITY | null> | undefined, item: ENTITY): void {
    const key = item.uuid + '#' + item.owner;
    const updatedIndex = this._updatedLocally.indexOf(key);
    if (updatedIndex >= 0)
      this._updatedLocally.splice(updatedIndex, 1);
    const createdIndex = this._createdLocally.findIndex($item => $item === item$ || $item.value === item);
    if (createdIndex >= 0)
      this._createdLocally.splice(createdIndex, 1);
  }

  protected override markDeletedInDb(table: Table<StoredItem<DTO>, any, StoredItem<DTO>>, item: ENTITY): Observable<any> {
    item.markAsDeletedLocally();
    const dto = this.toDTO(item);
    const key = item.uuid + '#' + item.owner;
    return from(table.put({id_owner: key, item: dto, updatedLocally: false, localUpdate: Date.now()}));
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

  public update(entity: ENTITY, ondone?: () => void): void {
    const key = entity.uuid + '#' + entity.owner;
    entity.updatedAt = Date.now();
    this.performOperation(
      () => {
        if (!entity.isCreatedLocally() && this._updatedLocally.indexOf(key) < 0)
          this._updatedLocally.push(key);
        const entity$ = this._store.value.find(item$ => item$.value?.uuid === entity.uuid && item$.value?.owner === entity.owner);
        entity$?.next(entity);
      },
      db => from(db.table<StoredItem<DTO>>(this.tableName).put({id_owner: key, item: this.toDTO(entity), updatedLocally: true, localUpdate: Date.now()})),
      status => {
        if (status.localUpdates) return false;
        status.localUpdates = true;
        return true;
      },
      ondone
    );
  }

  private updatedDtosFromServer(dtos: DTO[], deleted: {uuid: string; owner: string;}[] = []): Observable<boolean> {
    if (dtos.length === 0 && deleted.length === 0) return of(true);
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
    const deletedKeys: string[] = [];
    const deletedItems: BehaviorSubject<ENTITY | null>[] = [];
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
        if (item$.value)
          this.deleted(item$, item$.value);
      }
    });
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
    this._updatedLocally = [];
  }

  protected override itemFromDb(item: StoredItem<DTO>): ENTITY {
    if (item.updatedLocally) this._updatedLocally.push(item.id_owner);
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

  protected override sync(): void {
    this.ngZone.runOutsideAngular(() => {
      const db = this._db;
      const stillValid = () => this._db === db;

      this._syncStatus$.value.inProgress = true;
      this._syncStatus$.next(this._syncStatus$.value);

      this.syncCreateNewItems(stillValid)
      .pipe(
        switchMap(result => {
          if (!stillValid()) return of(false);
          return this.syncLocalDeleteToServer(stillValid);
        }),
        switchMap(result => {
          if (!stillValid()) return of(false);
          return this.syncUpdateFromServer(stillValid);
        }),
        switchMap(result => {
          if (!stillValid()) return of(false);
          return this.syncUpdateToServer(stillValid);
        }),
      ).subscribe({
        next: result => {
          if (stillValid()) {
            const status = this._syncStatus$.value;
            status.localCreates = this._createdLocally.length !== 0;
            status.localDeletes = this._deletedLocally.length !== 0;
            status.localUpdates = this._updatedLocally.length !== 0;
            status.inProgress = false;
            status.needsUpdateFromServer = false;
            status.lastUpdateFromServer = Date.now();
            this._syncStatus$.next(status);
          }
        },
        error: error => {
          // should never happen
          console.log(error);
        }
      });
    });
  }

  private syncCreateNewItems(stillValid: () => boolean): Observable<boolean> {
    this._createdLocally = this._createdLocally.filter($item => !!$item.value);
    if (this._createdLocally.length === 0) return of(true);
    const toCreate = this._createdLocally.map(item$ => item$.value!).filter(item => this._locks.startSync(item.uuid + '#' + item.owner));
    const ready = toCreate.filter(entity => this.readyToSave(entity));
    const ready$ = ready.length > 0 ? of(ready) : this.waitReadyWithTimeout(toCreate)
    return ready$.pipe(
      switchMap(readyEntities => {
        const notReady = toCreate.filter(item => !readyEntities.find(entity => entity.uuid === item.uuid && entity.owner === item.owner));
        for (const item of notReady) this._locks.syncDone(item.uuid + '#' + item.owner);
        if (readyEntities.length === 0) {
          console.log('Nothing ready to create on server among ' + toCreate.length + ' element(s) of ' + this.tableName);
          return of(false);
        }
        return this.createOnServer(readyEntities.map(entity => this.toDTO(entity))).pipe(
          switchMap(result => {
            console.log('' + result.length + '/' + readyEntities.length + ' ' + this.tableName + ' element(s) created on server');
            if (!stillValid()) return of(false);
            return this.updatedDtosFromServer(result);
          }),
          catchError(error => {
            console.error('Error creating ' + readyEntities.length + ' element(s) of ' + this.tableName + ' on server', error);
            this.injector.get(ErrorService).addNetworkError(error, 'errors.stores.create_items', [this.tableName]);
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
    const known = this._store.value.filter(item$ => this._createdLocally.indexOf(item$) < 0).map(item$ => item$.value).map(item => new Owned(item!).toDto());
    return this.getUpdatesFromServer(known).pipe(
      switchMap(result => {
        if (!stillValid()) return of(false);
        console.log('Server updates for ' + this.tableName + ': sent ' + known.length + ' known element(s), received ' + result.deleted.length + ' deleted, ' + result.updated.length + ' updated, ' + result.created.length + ' created');
        return this.updatedDtosFromServer([...result.updated, ...result.created], result.deleted);
      }),
      catchError(error => {
        console.error('Error requesting updates from server with ' + known.length + ' known element(s) of ' + this.tableName, error);
        this.injector.get(ErrorService).addNetworkError(error, 'errors.stores.get_updates', [this.tableName]);
        return of(false);
      })
    );
  }

  private syncUpdateToServer(stillValid: () => boolean): Observable<boolean> {
    if (this._updatedLocally.length === 0) return of(true);
    const toUpdate = this._store.value
      .map(item$ => item$.value)
      .filter(
        item => !!item &&
        this._updatedLocally.indexOf(item.uuid + '#' + item.owner) >= 0 &&
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
          console.log('Nothing ready to update on server among ' + toUpdate.length + ' element(s) of ' + this.tableName);
          return of(false);
        }
        return this.sendUpdatesToServer(readyEntities.map(entity => this.toDTO(entity))).pipe(
          switchMap(result => {
            if (!stillValid()) return of(false);
            console.log('' + result.length + '/' + readyEntities.length + ' ' + this.tableName + ' element(s) updated on server');
            for (const entity of readyEntities) {
              const updated = result.find(d => d.uuid === entity.uuid && d.owner === entity.owner);
              if (!updated) {
                // no update needed by the server: remove the updatedLocally from the DB
                this._db!.table<StoredItem<DTO>>(this.tableName).put({id_owner: entity.uuid + '#' + entity.owner, item: this.toDTO(entity), updatedLocally: false, localUpdate: Date.now()});
              }
              const index = this._updatedLocally.indexOf(entity.uuid + '#' + entity.owner);
              if (index >= 0) this._updatedLocally.splice(index, 1);
            }
            return this.updatedDtosFromServer(result).pipe(map(ok => ok && readyEntities.length === toUpdate.length));
          }),
          catchError(error => {
            console.error('Error updating ' + readyEntities.length + ' element(s) of ' + this.tableName + ' on server', error);
            this.injector.get(ErrorService).addNetworkError(error, 'errors.stores.send_updates', [this.tableName]);
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
    if (this._deletedLocally.length === 0) return of(true);
    const toDelete = this._deletedLocally.map(item => item.uuid);
    return this.deleteFromServer(toDelete).pipe(
      defaultIfEmpty(true),
      switchMap(() => {
        if (!stillValid()) return of(false);
        console.log('' + toDelete.length + ' element(s) of ' + this.tableName + ' deleted on server');
        return this.updatedDtosFromServer([], toDelete.map(uuid => ({uuid, owner: this.injector.get(DatabaseService).email!})));
      }),
      catchError(error => {
        console.error('Error deleting ' + toDelete.length + ' element(s) of ' + this.tableName + ' on server', error);
        this.injector.get(ErrorService).addNetworkError(error, 'errors.stores.delete_items', [this.tableName]);
        return of(false);
      })
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

  public inProgress = false;

  public get needsSync(): boolean { return this.localCreates || this.localUpdates || this.localDeletes || this.needsUpdateFromServer; }
  public get hasLocalChanges(): boolean { return this.localCreates || this.localUpdates || this.localDeletes; }

}
