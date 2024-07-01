import { DatabaseService } from './database.service';
import { BehaviorSubject, EMPTY, Observable, catchError, concat, defaultIfEmpty, from, map, of, switchMap } from 'rxjs';
import { NetworkService } from '../network/newtork.service';
import { Owned } from 'src/app/model/owned';
import { OwnedDto } from 'src/app/model/dto/owned';
import { Store, StoreSyncStatus } from './store';
import { Table } from 'dexie';
import { NgZone } from '@angular/core';


export abstract class OwnedStore<DTO extends OwnedDto, ENTITY extends Owned> extends Store<ENTITY, StoredItem<DTO>, OwnedStoreSyncStatus> {

  private _updatedLocally: string[] = [];
  private _syncStatus$ = new BehaviorSubject<OwnedStoreSyncStatus>(new OwnedStoreSyncStatus());

  constructor(
    tableName: string,
    databaseService: DatabaseService,
    network: NetworkService,
    ngZone: NgZone,
  ) {
    super(tableName, databaseService, network, ngZone);
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
    return {id_owner: item.uuid + '#' + item.owner, item: this.toDTO(item), updatedLocally: false};
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
    return from(table.put({id_owner: key, item: dto, updatedLocally: false}));
  }

  protected override updateStatusWithLocalDelete(status: OwnedStoreSyncStatus): boolean {
    if (status.localDeletes) return false;
    status.localDeletes = true;
    return true;
  }

  public update(entity: ENTITY): void {
    const key = entity.uuid + '#' + entity.owner;
    this.performOperation(
      () => {
        if (!entity.isCreatedLocally() && this._updatedLocally.indexOf(key) < 0)
          this._updatedLocally.push(key);
        const entity$ = this._store.value.find(item$ => item$.value?.uuid === entity.uuid && item$.value?.owner === entity.owner);
        entity$?.next(entity);
      },
      db => from(db.table<StoredItem<DTO>>(this.tableName).put({id_owner: key, item: this.toDTO(entity), updatedLocally: true})),
      status => {
        if (status.localUpdates) return false;
        status.localUpdates = true;
        return true;
      }
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
          dtosToAdd.push({id_owner: key, item: this.toDTO(entity), updatedLocally: false});
        }
      } else {
        dtosToUpdate.push({id_owner: key, item: this.toDTO(entity), updatedLocally: false});
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
    console.log('Sync table ' + this.tableName + ' with status ', this._syncStatus$.value);
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
          console.log('Sync done for table ' + this.tableName + ' with status ', status);
          this._syncStatus$.next(status);
        }
      },
      error: error => {
        // should never happen
        // TODO ?
        console.log(error);
      }
    });
  }

  private syncCreateNewItems(stillValid: () => boolean): Observable<boolean> {
    this._createdLocally = this._createdLocally.filter($item => !!$item.value);
    if (this._createdLocally.length === 0) return of(true);
    const toCreate = this._createdLocally.map(item$ => item$.value!);
    const ready = toCreate.filter(entity => this.readyToSave(entity));
    const ready$ = ready.length > 0 ? of(ready) : this.waitReadyWithTimeout(toCreate)
    return ready$.pipe(
      switchMap(readyEntities => {
        if (readyEntities.length === 0) {
          console.log('Nothing ready to create on server among ' + toCreate.length + ' element(s) of ' + this.tableName);
          return of(false);
        }
        console.log('Creating ' + readyEntities.length + ' element(s) of ' + this.tableName + ' on server');
        return this.createOnServer(readyEntities.map(entity => this.toDTO(entity))).pipe(
          switchMap(result => {
            console.log('' + result.length + '/' + readyEntities.length + ' ' + this.tableName + ' element(s) created on server');
            if (!stillValid()) return of(false);
            return this.updatedDtosFromServer(result);
          }),
          catchError(error => {
            // TODO
            console.error(error);
            return of(false);
          })
        );
      }),
    );
  }

  private syncUpdateFromServer(stillValid: () => boolean): Observable<boolean> {
    if (!this._syncStatus$.value.needsUpdateFromServer) return of(true);
    const known = this._store.value.filter(item$ => this._createdLocally.indexOf(item$) < 0).map(item$ => item$.value).map(item => new Owned(item!).toDto());
    console.log('Requesting updates from server: ' + known.length + ' known element(s) of ' + this.tableName);
    return this.getUpdatesFromServer(known).pipe(
      switchMap(result => {
        if (!stillValid()) return of(false);
        console.log('Server updates for ' + this.tableName + ': ' + result.deleted.length + ' deleted, ' + result.updated.length + ' updated, ' + result.created.length + ' created');
        return this.updatedDtosFromServer([...result.updated, ...result.created], result.deleted);
      }),
      catchError(error => {
        // TODO
        console.error(error);
        return of(false);
      })
    );
  }

  private syncUpdateToServer(stillValid: () => boolean): Observable<boolean> {
    if (this._updatedLocally.length === 0) return of(true);
    const toUpdate = this._store.value.map(item$ => item$.value).filter(item => !!item && this._updatedLocally.indexOf(item.uuid + '#' + item.owner) >= 0) as ENTITY[];
    if (toUpdate.length === 0) return of(true);
    const ready = toUpdate.filter(entity => this.readyToSave(entity));
    const ready$ = ready.length > 0 ? of(ready) : this.waitReadyWithTimeout(toUpdate)
    return ready$.pipe(
      switchMap(readyEntities => {
        if (readyEntities.length === 0) {
          console.log('Nothing ready to update on server among ' + toUpdate.length + ' element(s) of ' + this.tableName);
          return of(false);
        }
        console.log('Updating ' + readyEntities.length + ' element(s) of ' + this.tableName + ' on server');
        return this.sendUpdatesToServer(readyEntities.map(entity => this.toDTO(entity))).pipe(
          switchMap(result => {
            if (!stillValid()) return of(false);
            console.log('' + result.length + '/' + readyEntities.length + ' ' + this.tableName + ' element(s) updated on server');
            this._updatedLocally = [];
            return this.updatedDtosFromServer(result).pipe(map(ok => ok && readyEntities.length === toUpdate.length));
          }),
          catchError(error => {
            // TODO
            console.error(error);
            return of(false);
          })
        );
      }),
    );
  }

  private syncLocalDeleteToServer(stillValid: () => boolean): Observable<boolean> {
    if (this._deletedLocally.length === 0) return of(true);
    const toDelete = this._deletedLocally.map(item => item.uuid);
    console.log('Deleting ' + toDelete.length + ' element(s) of ' + this.tableName + ' on server');
    return this.deleteFromServer(toDelete).pipe(
      defaultIfEmpty(true),
      switchMap(() => {
        if (!stillValid()) return of(false);
        return this.updatedDtosFromServer([], toDelete.map(uuid => ({uuid, owner: this.databaseService.email!})));
      }),
      catchError(error => {
        // TODO
        console.error(error);
        return of(false);
      })
    );
  }

}

interface StoredItem<DTO> {
  id_owner: string;
  item: DTO;
  updatedLocally: boolean;
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

  public inProgress = false;

  public get needsSync(): boolean { return this.localCreates || this.localUpdates || this.localDeletes || this.needsUpdateFromServer; }

}
