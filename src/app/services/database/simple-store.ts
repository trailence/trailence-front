import { BehaviorSubject, Observable, catchError, combineLatest, debounceTime, defaultIfEmpty, filter, first, from, map, mergeMap, of, timeout } from "rxjs";
import { Store, StoreSyncStatus } from "./store";
import { DatabaseService } from "./database.service";
import { NetworkService } from "../network/newtork.service";
import { Table } from "dexie";
import { NgZone } from "@angular/core";

interface SimpleStoreItem<T> {
    item: T;
    createdLocally: boolean;
    deletedLocally: boolean;
}

export class SimpleStoreSyncStatus implements StoreSyncStatus {
    public localCreates = true;
    public localDeletes = true;
    public needsUpdateFromServer = true;
  
    public inProgress = false;
  
    public get needsSync(): boolean { return this.localCreates || this.localDeletes || this.needsUpdateFromServer; }
}

export abstract class SimpleStore<DTO, ENTITY> extends Store<ENTITY, SimpleStoreItem<DTO>, SimpleStoreSyncStatus> {

    private _syncStatus$ = new BehaviorSubject<SimpleStoreSyncStatus>(new SimpleStoreSyncStatus());

    constructor(
      tableName: string,
      databaseService: DatabaseService,
      network: NetworkService,
      ngZone: NgZone,
    ) {
      super(tableName, databaseService, network, ngZone);
      this._initStore();
    }

    public override get syncStatus$() { return this._syncStatus$; }
    public override get syncStatus() { return this._syncStatus$.value; }
    protected override set syncStatus(status: SimpleStoreSyncStatus) { this._syncStatus$.next(status); }

    protected abstract fromDTO(dto: DTO): ENTITY;
    protected abstract toDTO(entity: ENTITY): DTO;
    protected abstract areSame(dto: DTO, entity: ENTITY): boolean;
  
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

    private saveStore(): Observable<boolean> {
        return from(this._db!.transaction('rw', this.tableName, async tx => {
            const table = tx.db.table<SimpleStoreItem<DTO>>(this.tableName);
            await table.clear();
            const dbItems: SimpleStoreItem<DTO>[] = [];
            this._store.values.forEach(item$ => {
              if (item$.value) {
                dbItems.push({
                  item: this.toDTO(item$.value),
                  createdLocally: this._createdLocally.indexOf(item$) >= 0,
                  deletedLocally: false,
                });
              }
            });
            this._deletedLocally.forEach(item => {
              dbItems.push({
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

    protected override dbItemCreatedLocally(item: ENTITY): SimpleStoreItem<DTO> {
      return {
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

    protected abstract dbItemCriteria(item: ENTITY): {[key: string]: any};

    protected override markDeletedInDb(table: Table<SimpleStoreItem<DTO>, any, SimpleStoreItem<DTO>>, item: ENTITY): Observable<any> {
      return from(table.where(this.dbItemCriteria(item)).delete());
    }

    protected override updateStatusWithLocalDelete(status: SimpleStoreSyncStatus): boolean {
      if (status.localDeletes) return false;
      status.localDeletes = true;
      return true;
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
            return this.syncGetAllFromServer(stillValid);
          }),
        ).subscribe({
          next: result => {
            if (stillValid()) {
              if (result) this._syncStatus$.value.needsUpdateFromServer = false;
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
        if (this._createdLocally.length === 0) return of(true);
        const toCreate = this._createdLocally.map(item$ => item$.value!);
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
                result.forEach(created => {
                  const index = this._createdLocally.findIndex(item$ => this.areSame(created, item$.value!));
                  if (index >= 0) this._createdLocally.splice(index, 1);
                });
                this._syncStatus$.value.localCreates = this._createdLocally.length !== 0;
                return this.saveStore().pipe(map(ok => ok && readyEntities.length === toCreate.length));
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
        const toDelete = [...this._deletedLocally];
        if (toDelete.length === 0) return of(true);
        console.log('Deleting ' + toDelete.length + ' element(s) of ' + this.tableName + ' on server');
        return this.deleteFromServer(toDelete.map(entity => this.toDTO(entity))).pipe(
          defaultIfEmpty(true),
          mergeMap(() => {
            if (!stillValid()) return of(false);
            toDelete.forEach(entity => {
              const index = this._deletedLocally.indexOf(entity);
              if (index >= 0) this._deletedLocally.splice(index, 1);
            });
            this._syncStatus$.value.localDeletes = this._deletedLocally.length !== 0;
            return this.saveStore();
          }),
          catchError(error => {
            // TODO
            console.error(error);
            return of(false);
          })
        );
      }

      private syncGetAllFromServer(stillValid: () => boolean): Observable<boolean> {
        return this.getAllFromServer().pipe(
            mergeMap(dtos => {
                if (!stillValid()) return of(false);
                // remove items not created locally and not returned by the server, and add new items from server
                const deleted: BehaviorSubject<ENTITY | null>[] = [];
                this._store.values.forEach(
                  item$ => {
                    if (!item$.value) return;
                    const index = dtos.findIndex(dto => this.areSame(dto, item$.value!));
                    if (index >= 0) {
                      // returned by server => already known
                      dtos.splice(index, 1);
                    } else {
                      // not returned by the server
                      if (this._createdLocally.indexOf(item$) < 0) {
                        // not created locally => removed from server
                        deleted.push(item$);
                      }
                    }
                  }
                );
                const added: BehaviorSubject<ENTITY | null>[] = [];
                dtos.forEach(dto => {
                  if (!this._deletedLocally.find(entity => this.areSame(dto, entity))) {
                    // not deleted locally => new item from server
                    added.push(new BehaviorSubject<ENTITY | null>(this.fromDTO(dto)));
                  }
                });
                if (deleted.length > 0 || added.length > 0) {
                  this._store.addAndRemove(added, deleted);
                  return this.saveStore();
                }
                return of(true);
            })
        );
      }
}