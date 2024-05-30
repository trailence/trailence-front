import { DatabaseService } from './database.service';
import { BehaviorSubject, Observable, Subscription, catchError, combineLatest, defaultIfEmpty, distinctUntilChanged, filter, first, from, map, mergeMap, of, timeout } from 'rxjs';
import Dexie from 'dexie';
import { NetworkService } from '../network/newtork.service';
import { Owned } from 'src/app/model/owned';
import { OwnedDto } from 'src/app/model/dto/owned';

const AUTO_UPDATE_FROM_SERVER_EVERY = 30 * 60 * 1000;
const MINIMUM_SYNC_INTERVAL = 30 * 1000;

export abstract class AbstractStore<DTO extends OwnedDto, ENTITY extends Owned> {

  private _store = new BehaviorSubject<BehaviorSubject<ENTITY | null>[]>([]);
  private _updatedLocally: string[] = [];
  private _storeLoaded$ = new BehaviorSubject<boolean>(false);
  private _db?: Dexie;
  private _syncStatus$ = new BehaviorSubject<SyncStatus>(new SyncStatus());
  private _operationInProgress$ = new BehaviorSubject<boolean>(false);
  private _lastSync = 0;
  private _syncTimeout?: any;

  constructor(
    private tableName: string,
    private databaseService: DatabaseService,
    network: NetworkService,
  ) {
    databaseService.registerStore(this);
    // listen to database change (when authentication changed)
    databaseService.db$.subscribe(db => {
      if (db) this.load(db);
      else this.close();
    });

    // we need to sync when:
    combineLatest([
      this._storeLoaded$,         // local database is loaded
      network.connected$,         // network is connected
      this._syncStatus$,          // there is something to sync and we are not syncing
      this._operationInProgress$, // and no operation in progress
    ]).pipe(
      map(([storeLoaded, networkConnected, syncStatus]) => storeLoaded && networkConnected && syncStatus.needsSync && !syncStatus.inProgress),
      filter(shouldSync => {
        if (!shouldSync) return false;
        if (Date.now() - this._lastSync < MINIMUM_SYNC_INTERVAL) {
          if (!this._syncTimeout) {
            this._syncTimeout = setTimeout(() => this._syncStatus$.next(this._syncStatus$.value), Math.max(1000, MINIMUM_SYNC_INTERVAL - (Date.now() - this._lastSync)));
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
    this._syncStatus$.subscribe(status => {
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

  protected abstract fromDTO(dto: DTO): ENTITY;
  protected abstract toDTO(entity: ENTITY): DTO;

  protected abstract readyToSave(entity: ENTITY): boolean;
  protected abstract readyToSave$(entity: ENTITY): Observable<boolean>;

  protected abstract createOnServer(items: DTO[]): Observable<DTO[]>;
  protected abstract getUpdatesFromServer(knownItems: OwnedDto[]): Observable<UpdatesResponse<DTO>>;
  protected abstract sendUpdatesToServer(items: DTO[]): Observable<DTO[]>;
  protected abstract deleteFromServer(uuids: string[]): Observable<void>;

  public get syncStatus$(): Observable<SyncStatus> { return this._syncStatus$; }

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

  private close(): void {
    if (!this._db) return;
    this._db = undefined;
    this._storeLoaded$.next(false);
    this._updatedLocally = [];
    const items = this._store.value;
    this._store.next([]);
    items.forEach(item$ => item$.complete());
  }

  private load(db: Dexie): void {
    if (this._db) this.close();
    this._db = db;
    from(db.table<StoredItem<DTO>>(this.tableName).toArray()).subscribe(
      items => {
        if (this._db !== db) return;
        this._syncStatus$.value.resetAllAsNeeded();
        this._syncStatus$.next(this._syncStatus$.value);
        if (this._syncTimeout) clearTimeout(this._syncTimeout);
        this._syncTimeout = undefined;
        this._lastSync = 0;
          const newStore: BehaviorSubject<ENTITY | null>[] = [];
        items.forEach(item => {
          newStore.push(new BehaviorSubject<ENTITY | null>(this.fromDTO(item.item)));
          if (item.updatedLocally) this._updatedLocally.push(item.id_owner);
        });
        this._store.next(newStore);
        this._storeLoaded$.next(true);
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

  private performOperation(
    storeUpdater: (store: BehaviorSubject<ENTITY | null>[]) => boolean,
    tableUpdater: (db: Dexie) => Observable<any>,
    statusUpdater: (status: SyncStatus) => boolean
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
        const status = this._syncStatus$.value;
        if (statusUpdater(status)) {
          this._lastSync = 0;
          this._syncStatus$.next(status);
        }
        this._operationInProgress$.next(false);
      });
    })
  }

  private sync(): void {
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
            this._updatedLocally = [];
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

export class SyncStatus {
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
