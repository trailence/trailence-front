import { BehaviorSubject, Observable, catchError, combineLatest, defaultIfEmpty, filter, first, from, map, mergeMap, of, timeout } from "rxjs";
import { Store, StoreSyncStatus } from "./store";
import { DatabaseService } from "./database.service";
import { NetworkService } from "../network/newtork.service";

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

export abstract class SimpleStore<DTO, ENTITY> extends Store<SimpleStoreItem<ENTITY>, SimpleStoreItem<DTO>, SimpleStoreSyncStatus> {

    private _syncStatus$ = new BehaviorSubject<SimpleStoreSyncStatus>(new SimpleStoreSyncStatus());

    constructor(
      tableName: string,
      databaseService: DatabaseService,
      network: NetworkService,
    ) {
      super(tableName, databaseService, network);
      this._initStore();
    }

    public override get syncStatus$() { return this._syncStatus$; }
    public override get syncStatus() { return this._syncStatus$.value; }
    protected override set syncStatus(status: SimpleStoreSyncStatus) { this._syncStatus$.next(status); }

    protected abstract fromDTO(dto: DTO): ENTITY;
    protected abstract toDTO(entity: ENTITY): DTO;
    protected abstract areSame(dto: DTO, entity: ENTITY): boolean;
  
    protected abstract readyToSave(entity: ENTITY): boolean;
    protected abstract readyToSave$(entity: ENTITY): Observable<boolean>;
  
    protected abstract createOnServer(items: DTO[]): Observable<DTO[]>;
    protected abstract deleteFromServer(items: DTO[]): Observable<void>;
    protected abstract getAllFromServer(): Observable<DTO[]>;

    protected override itemFromDb(item: SimpleStoreItem<DTO>): SimpleStoreItem<ENTITY> {
        return {
            item: this.fromDTO(item.item),
            createdLocally: item.createdLocally,
            deletedLocally: item.deletedLocally,
        };
    }

    private saveStore(): Observable<boolean> {
        return from(this._db!.transaction('rw', this.tableName, async tx => {
            const table = tx.db.table<SimpleStoreItem<DTO>>(this.tableName);
            await table.clear();
            await table.bulkAdd(
                this._store.value
                .filter(item => !!item.value)
                .map(item => ({
                    item: this.toDTO(item.value!.item),
                    createdLocally: item.value!.createdLocally,
                    deletedLocally: item.value!.deletedLocally
                }))
            );
          })).pipe(defaultIfEmpty(true), map(() => true));
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
        if (!this._syncStatus$.value.localCreates) return of(true);
        const toCreate = this._store.value.map(item$ => item$.value).filter(item => item?.createdLocally) as ENTITY[];
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
                this._store.value.forEach(storeItem => {
                    if (storeItem.value && readyEntities.indexOf(storeItem.value.item) >= 0) {
                        if (result.find(dto => this.areSame(dto, storeItem.value!.item))) {
                            storeItem.value!.createdLocally = false;
                        }
                    }
                });
                this._store.next(this._store.value);
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

      private syncLocalDeleteToServer(stillValid: () => boolean): Observable<boolean> {
        if (!this._syncStatus$.value.localDeletes) return of(true);
        const toDelete = this._store.value.map(item$ => item$.value).filter(item => item?.deletedLocally).map(item => item!.item);
        if (toDelete.length === 0) return of(true);
        console.log('Deleting ' + toDelete.length + ' element(s) of ' + this.tableName + ' on server');
        return this.deleteFromServer(toDelete.map(entity => this.toDTO(entity))).pipe(
          defaultIfEmpty(true),
          mergeMap(() => {
            if (!stillValid()) return of(false);
            toDelete.forEach(entity => {
                const index = this._store.value.findIndex(item => item.value?.item == entity);
                if (index >= 0)
                    this._store.value.splice(index, 1);
            });
            this._store.next(this._store.value);
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
                let changed = false;
                // remove items not created locally and not returned by the server
                this._store.value.filter(item => !item.value?.createdLocally && !dtos.find(dto => this.areSame(dto, item.value!.item)))
                .forEach(toDelete => {
                    const index = this._store.value.indexOf(toDelete);
                    if (index >= 0) {
                        this._store.value.splice(index, 1);
                        changed = true;
                    }
                });
                // add new items from server
                const newItems = dtos.filter(dto => !this._store.value.find(item => item.value && this.areSame(dto, item.value.item)));
                if (newItems) {
                    this._store.value.push(...newItems.map(dto => new BehaviorSubject<SimpleStoreItem<ENTITY> | null>({item: this.fromDTO(dto), createdLocally: false, deletedLocally: false})));
                    changed = true;
                }
                if (changed) {
                    this._store.next(this._store.value);
                    return this.saveStore();
                }
                return of(true);
            })
        );
      }
}