import { DatabaseService } from './database.service';
import { BehaviorSubject, Observable, catchError, combineLatest, defaultIfEmpty, distinctUntilChanged, filter, first, from, map, mergeMap, of, timeout } from 'rxjs';
import { NetworkService } from '../network/newtork.service';
import { Owned } from 'src/app/model/owned';
import { OwnedDto } from 'src/app/model/dto/owned';
import { Store, StoreSyncStatus } from './store';


export abstract class OwnedStore<DTO extends OwnedDto, ENTITY extends Owned> extends Store<ENTITY, StoredItem<DTO>, OwnedStoreSyncStatus> {

  private _updatedLocally: string[] = [];
  private _syncStatus$ = new BehaviorSubject<OwnedStoreSyncStatus>(new OwnedStoreSyncStatus());

  constructor(
    tableName: string,
    databaseService: DatabaseService,
    network: NetworkService,
  ) {
    super(tableName, databaseService, network);
    this._initStore();
  }

  protected abstract fromDTO(dto: DTO): ENTITY;
  protected abstract toDTO(entity: ENTITY): DTO;

  protected abstract readyToSave(entity: ENTITY): boolean;
  protected abstract readyToSave$(entity: ENTITY): Observable<boolean>;

  protected abstract createOnServer(items: DTO[]): Observable<DTO[]>;
  protected abstract getUpdatesFromServer(knownItems: OwnedDto[]): Observable<UpdatesResponse<DTO>>;
  protected abstract sendUpdatesToServer(items: DTO[]): Observable<DTO[]>;
  protected abstract deleteFromServer(uuids: string[]): Observable<void>;

  public override get syncStatus$() { return this._syncStatus$; }
  public override get syncStatus() { return this._syncStatus$.value; }
  protected override set syncStatus(status: OwnedStoreSyncStatus) { this._syncStatus$.next(status); }

  public getAll$(filter: (element: ENTITY) => boolean = () => true): Observable<Observable<ENTITY | null>[]> {
    return this._store.pipe(
      map(items => items.filter(item$ => item$.value && item$.value.version >= 0 && filter(item$.value))) // remove unknown items and items deleted locally
    );
  }

  public getItem$(uuid: string, owner: string): Observable<ENTITY | null> {
    return this._store.pipe(
      mergeMap(items => {
        const item$ = items.find(item$ => item$.value?.uuid === uuid && item$.value?.owner === owner && !item$.value.isDeletedLocally());
        if (!item$) return of(null);
        return item$;
      }),
      distinctUntilChanged(),
    );
  }

  public getItem(uuid: string, owner: string): ENTITY | null {
    const item$ = this._store.value.find(item$ => item$.value?.uuid === uuid && item$.value?.owner === owner && !item$.value.isDeletedLocally());
    return item$?.value ?? null;
  }

  public create(entity: ENTITY): Observable<ENTITY | null> {
    const entity$ = new BehaviorSubject<ENTITY | null>(entity)
    this.performOperation(
      store => {
        store.push(entity$);
        return true;
      },
      db => from(db.table<StoredItem<DTO>>(this.tableName).add({id_owner: entity.uuid + '#' + entity.owner, item: this.toDTO(entity), updatedLocally: false})),
      status => {
        if (!status.localCreates) {
          status.localCreates = true;
          return true;
        }
        return false;
      }
    );
    return entity$;
  }

  public update(entity: ENTITY): void {
    const key = entity.uuid + '#' + entity.owner;
    this.performOperation(
      store => {
        const entity$ = store.find(item$ => item$.value?.uuid === entity.uuid && item$.value?.owner === entity.owner);
        entity$?.next(entity);
        if (!entity.isCreatedLocally() && this._updatedLocally.indexOf(key) < 0)
          this._updatedLocally.push(key);
        return false;
      },
      db => from(db.table<StoredItem<DTO>>(this.tableName).put({id_owner: key, item: this.toDTO(entity), updatedLocally: true})),
      status => {
        if (!status.localUpdates) {
          status.localUpdates = true;
          return true;
        }
        return false;
      }
    );
  }

  public delete(entity: ENTITY): void {
    const key = entity.uuid + '#' + entity.owner;
    entity.markAsDeletedLocally();
    this.performOperation(
      store => {
        const entity$ = store.find(item$ => item$.value?.uuid === entity.uuid && item$.value?.owner === entity.owner);
        entity$?.next(entity);
        const updatedIndex = this._updatedLocally.indexOf(key);
        if (updatedIndex >= 0)
          this._updatedLocally.splice(updatedIndex, 1);
        return true;
      },
      db => {
        const dto = this.toDTO(entity);
        return from(db.table<StoredItem<DTO>>(this.tableName).put({id_owner: key, item: dto, updatedLocally: false}));
      },
      status => {
        if (!status.localDeletes) {
          status.localDeletes = true;
          return true;
        }
        return false;
      }
    );
  }

  private updatedDtosFromServer(dtos: DTO[], deleted: {uuid: string; owner: string;}[] = []): Observable<boolean> {
    if (dtos.length === 0 && deleted.length === 0) return of(true);
    const items = this._store.value;
    const entitiesToAdd: BehaviorSubject<ENTITY | null>[] = [];
    const dtosToAdd: StoredItem<DTO>[] = [];
    const dtosToUpdate: StoredItem<DTO>[] = [];
    dtos.forEach(dto => {
      const key = dto.uuid + '#' + dto.owner;
      const entity = this.fromDTO(dto);
      const item$ = items.find(item$ => item$.value?.uuid === entity.uuid && item$.value?.owner === entity.owner);
      if (!item$) {
        entitiesToAdd.push(new BehaviorSubject<ENTITY | null>(entity));
        dtosToAdd.push({id_owner: key, item: this.toDTO(entity), updatedLocally: false});
      } else if (!item$.value?.isDeletedLocally()) {
        item$.next(entity);
        dtosToUpdate.push({id_owner: key, item: this.toDTO(entity), updatedLocally: false});
        const updatedIndex = this._updatedLocally.indexOf(key);
        if (updatedIndex >= 0)
          this._updatedLocally.splice(updatedIndex, 1);
      }
    });
    const deletedKeys: string[] = [];
    let hasDeleted = false;
    deleted.forEach(deletedItem => {
      const index = items.findIndex(item$ => item$.value?.uuid === deletedItem.uuid && item$.value?.owner === deletedItem.owner);
      if (index >= 0) {
        const item$ = items[index];
        const key = deletedItem.uuid + '#' + deletedItem.owner;
        deletedKeys.push(key);
        const updatedIndex = this._updatedLocally.indexOf(key);
        if (updatedIndex >= 0)
          this._updatedLocally.splice(updatedIndex, 1);
        items.splice(index, 1);
        hasDeleted = true;
        item$.next(null);
      }
    });
    if (entitiesToAdd.length !== 0 || hasDeleted) {
      items.push(...entitiesToAdd);
      this._store.next(items);
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
    this._syncStatus$.value.resetAllAsNeeded();
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
      mergeMap(result => {
        if (!stillValid()) return of(false);
        if (result && this._syncStatus$.value.localCreates) {
          this._syncStatus$.value.localCreates = false;
          this._syncStatus$.next(this._syncStatus$.value);
        }
        return this.syncLocalDeleteToServer(stillValid);
      }),
      mergeMap(result => {
        if (!stillValid()) return of(false);
        if (result && this._syncStatus$.value.localDeletes) {
          this._syncStatus$.value.localDeletes = false;
          this._syncStatus$.next(this._syncStatus$.value);
        }
        return this.syncUpdateFromServer(stillValid);
      }),
      mergeMap(result => {
        if (!stillValid()) return of(false);
        if (result && this._syncStatus$.value.needsUpdateFromServer) {
          this._syncStatus$.value.needsUpdateFromServer = false;
          this._syncStatus$.next(this._syncStatus$.value);
        }
        return this.syncUpdateToServer(stillValid);
      }),
    ).subscribe({
      next: result => {
        if (stillValid()) {
          if (result) this._syncStatus$.value.localUpdates = false;
          this._syncStatus$.value.inProgress = false;
          console.log('Sync done for table ' + this.tableName + ' with status ', this._syncStatus$.value);
          this._syncStatus$.next(this._syncStatus$.value);
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
    if (!this._syncStatus$.value.localCreates) return of(true);
    const toCreate = this._store.value.map(item$ => item$.value).filter(item => item?.isCreatedLocally()) as ENTITY[];
    if (toCreate.length === 0) return of(true);
    const ready = toCreate.filter(entity => this.readyToSave(entity));
    const ready$ = ready.length > 0 ? of(ready) : this.waitReadyWithTimeout(toCreate)
    return ready$.pipe(
      mergeMap(readyEntities => {
        if (readyEntities.length === 0) {
          console.log('Nothing ready to create on server among ' + toCreate.length + ' element(s) of ' + this.tableName);
          return of(false);
        }
        console.log('Creating ' + readyEntities.length + ' element(s) of ' + this.tableName + ' on server');
        return this.createOnServer(readyEntities.map(entity => this.toDTO(entity))).pipe(
          mergeMap(result => {
            console.log('' + result.length + '/' + readyEntities.length + ' ' + this.tableName + ' element(s) created on server');
            if (!stillValid()) return of(false);
            return this.updatedDtosFromServer(result).pipe(map(ok => ok && readyEntities.length === toCreate.length));
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
    const known = this._store.value.map(item$ => item$.value).filter(item => item && !item.isCreatedLocally() && !item.isDeletedLocally()).map(item => new Owned(item!).toDto());
    console.log('Requesting updates from server: ' + known.length + ' known element(s) of ' + this.tableName);
    return this.getUpdatesFromServer(known).pipe(
      mergeMap(result => {
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
    if (!this._syncStatus$.value.localUpdates) return of(true);
    if (this._updatedLocally.length === 0) return of(true);
    const toUpdate = this._store.value.map(item$ => item$.value).filter(item => !!item && this._updatedLocally.indexOf(item.uuid + '#' + item.owner) >= 0) as ENTITY[];
    if (toUpdate.length === 0) return of(true);
    const ready = toUpdate.filter(entity => this.readyToSave(entity));
    const ready$ = ready.length > 0 ? of(ready) : this.waitReadyWithTimeout(toUpdate)
    return ready$.pipe(
      mergeMap(readyEntities => {
        if (readyEntities.length === 0) {
          console.log('Nothing ready to update on server among ' + toUpdate.length + ' element(s) of ' + this.tableName);
          return of(false);
        }
        console.log('Updating ' + readyEntities.length + ' element(s) of ' + this.tableName + ' on server');
        return this.sendUpdatesToServer(readyEntities.map(entity => this.toDTO(entity))).pipe(
          mergeMap(result => {
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
    if (!this._syncStatus$.value.localDeletes) return of(true);
    const toDelete = this._store.value.map(item$ => item$.value).filter(item => item?.isDeletedLocally()).map(item => item!.uuid);
    if (toDelete.length === 0) return of(true);
    console.log('Deleting ' + toDelete.length + ' element(s) of ' + this.tableName + ' on server');
    return this.deleteFromServer(toDelete).pipe(
      defaultIfEmpty(true),
      mergeMap(() => {
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

  private waitReadyWithTimeout(entities: ENTITY[]): Observable<ENTITY[]> {
    return combineLatest(
      entities.map(entity => this.readyToSave$(entity).pipe(
        filter(ready => ready),
        timeout({ first: 5000, with: () => of(false) })
      ))
    ).pipe(
      first(),
      map(readiness => entities.filter((entity, index) => readiness[index]))
    )
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
  public localCreates = true;
  public localUpdates = true;
  public localDeletes = true;
  public needsUpdateFromServer = true;

  public inProgress = false;

  public get needsSync(): boolean { return this.localCreates || this.localUpdates || this.localDeletes || this.needsUpdateFromServer; }

  resetAllAsNeeded(): void {
    this.localCreates = true;
    this.localUpdates = true;
    this.localDeletes = true;
    this.needsUpdateFromServer = true;
    this.inProgress = false;
  }

}
