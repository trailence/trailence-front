import { Injectable } from '@angular/core';
import { BehaviorSubject, catchError, EMPTY, filter, first, map, Observable, of, switchMap } from 'rxjs';
import { Extension } from 'src/app/model/extension';
import { StoreLoadStatus, StoreSyncStatus } from './store/store';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { Arrays } from 'src/app/utils/arrays';
import { Console } from 'src/app/utils/console';
import { StoreService } from './store/store.service';
import { CommonDatabaseService } from './common-database.service';
import { DbStatus, DbTable } from './storage/db-table';

@Injectable({
  providedIn: 'root'
})
export class ExtensionsService {

  private readonly _extensions$ = new BehaviorSubject<Extension[]>([]);
  private readonly _syncStatus$ = new BehaviorSubject<ExtensionsSyncStatus>(new ExtensionsSyncStatus());
  private readonly _loaded$ = new BehaviorSubject<StoreLoadStatus | undefined>(undefined);
  private readonly _pendingOperation$ = new BehaviorSubject<number>(0);
  private readonly table: DbTable<DbItem>;

  constructor(
    storeService: StoreService,
    commonDb: CommonDatabaseService,
    private readonly http: HttpService,
  ) {
    storeService.registerStore({
      name: 'extensions',
      store: this,
      status$: this._syncStatus$,
      getStatus: () => this._syncStatus$.value,
      loadStatus$: this._loaded$,
      hasPendingOperations$: this._pendingOperation$.pipe(map(nb => nb > 0)),
      fireSyncStatus: () => this._syncStatus$.next(this._syncStatus$.value),
      syncFromServer: () => this.triggerUpdatesFromServer(),
      doSync: () => this.sync(),
      resetErrors: () => null,
      hardDelete: () => this.hardDelete(),
    });
    this.table = commonDb.extensionsTable;
    this.table.onStatus$().subscribe(status => {
      if (status) this.load(status);
      else this.unload();
    });
  }

  public getExtensions$(): Observable<Extension[]> {
    return this._extensions$.pipe(map(list => list.filter(e => e.version >= 0)));
  }

  public saveExtension(extensionName: string, createIfNeeded: boolean, updater: (extension: Extension) => void): void {
    const loaded = this._loaded$.value;
    if (!loaded) return;
    this._pendingOperation$.next(this._pendingOperation$.value + 1);
    this._syncStatus$.pipe(
      filter(s => !s.inProgress),
      first(),
    ).subscribe(() => {
      if (loaded.counter !== this._loaded$.value?.counter) return;
      let e: Extension | undefined;
      try {
        e = this._extensions$.value.find(e => e.extension === extensionName);
        if (e) {
          updater(e);
          if (e.version >= 0)
            Console.info('Updated extension ' + e.extension + ' locally', e);
          else
            Console.info('Deleted extension ' + e.extension + ' locally', e);
        } else if (createIfNeeded) {
          e = new Extension(0, extensionName, {});
          updater(e);
          Console.info('Created extension ' + e.extension + ' locally', e);
          this._extensions$.value.push(e);
        } else {
          this._pendingOperation$.next(this._pendingOperation$.value - 1);
          return;
        }
      } catch (e) {
        Console.error("Error saving extension", extensionName, e);
        this._pendingOperation$.next(this._pendingOperation$.value - 1);
        return;
      }
      this._extensions$.next(this._extensions$.value);
      this._syncStatus$.value.needsUpdateFromServer = true;
      this._syncStatus$.value.hasLocalChanges = true;
      this._syncStatus$.next(this._syncStatus$.value);
      this.table.setOne$({
        version: e.version,
        extension: e.extension,
        data: e.data
      }).subscribe({
        next: () => this._pendingOperation$.next(this._pendingOperation$.value - 1),
        error: e => Console.warn('Error updating extensions table', e)
      });
    });
  }

  public removeExtension(extensionName: string): void {
    this.saveExtension(extensionName, false, e => e.markAsDeleted());
  }

  private _loadCounter = 0;
  private unload(): void {
    this._loadCounter = 0;
    this._loaded$.next(undefined);
    this._extensions$.next([]);
    this._syncStatus$.next(new ExtensionsSyncStatus());
    this._pendingOperation$.next(0);
  }

  private load(loadStatus: DbStatus<DbItem>): void {
    this._loadCounter = loadStatus.counter;
    this._pendingOperation$.next(0);
    this._syncStatus$.value.needsUpdateFromServer = true;
    this._syncStatus$.next(this._syncStatus$.value);
    this.table.getAll$().subscribe({
      next: items => {
        if (this._loadCounter !== loadStatus.counter) return;
        this._extensions$.next(items.map(item => new Extension(item.version, item.extension, item.data)));
        this._loaded$.next({counter: loadStatus.counter, email: loadStatus.email!});
      },
      error: e => Console.error('Error loading extensions', e),
    });
  }

  private triggerUpdatesFromServer(): void {
    this._syncStatus$.value.needsUpdateFromServer = true;
    this._syncStatus$.next(this._syncStatus$.value);
  }

  private sync(): Observable<boolean> {
    const status = this._loaded$.value;
    if (!status) return EMPTY;
    return this._pendingOperation$.pipe(
      filter(nb => nb === 0),
      first(),
      switchMap(() => this.doSync(status)),
    );
  }

  private doSync(status: StoreLoadStatus): Observable<boolean> {
    if (status.counter !== this._loaded$.value?.counter) return EMPTY;
    this._syncStatus$.value.inProgress = true;
    this._syncStatus$.next(this._syncStatus$.value);
    Console.info('Sending updates for extensions:', this._extensions$.value.length);
    return this.http.post<DbItem[]>(environment.apiBaseUrl + '/extensions/v1', this._extensions$.value.map(e => ({version: e.version, extension: e.extension, data: e.data})))
    .pipe(
      switchMap(list => {
        if (status.counter !== this._loaded$.value?.counter) return EMPTY;
        if (Arrays.sameContent(list, this._extensions$.value, (i1, i2) => i1.extension === i2.extension && i1.version === i2.version)) {
          Console.info('Extensions sync without change', list.length);
          return of(true);
        }
        Console.info('Extension(s) received from server: ', list.length);
        const extensions = list.map(item => new Extension(item.version, item.extension, item.data));
        this._extensions$.next(extensions);
        const items = extensions.map(e => ({
          version: e.version,
          extension: e.extension,
          data: e.data
        }));
        return this.table.inTransaction$(false, stillValid =>
          this.table.deleteAll$().pipe(
            switchMap(() => {
              if (!stillValid()) return EMPTY;
              return this.table.setMany$(items);
            }),
            catchError(e => {
              Console.error('Error computing extensions received from server', e);
              return of(true);
            }),
          )
        );
      }),
      map(() => { // NOSONAR
        if (status.counter !== this._loaded$.value?.counter) return false;
        this._syncStatus$.value.inProgress = false;
        this._syncStatus$.value.needsUpdateFromServer = false;
        this._syncStatus$.value.lastUpdateFromServer = Date.now();
        this._syncStatus$.value.hasLocalChanges = false;
        this._syncStatus$.next(this._syncStatus$.value);
        return false;
      }),
      catchError(e => {
        if (status.counter !== this._loaded$.value?.counter) return EMPTY;
        Console.error('Error loading extensions', e);
        this._syncStatus$.value.inProgress = false;
        this._syncStatus$.next(this._syncStatus$.value);
        return of(false);
      })
    );
  }

  private hardDelete(): Observable<any> {
    this._extensions$.next([]);
    return this.table.deleteAll$();
  }

}

class ExtensionsSyncStatus implements StoreSyncStatus {

  inProgress = false;
  needsUpdateFromServer = true;
  lastUpdateFromServer?: number;
  hasLocalChanges = false;

  get needsSync(): boolean {
    return this.needsUpdateFromServer;
  }

}

interface DbItem {
  version: number;
  extension: string;
  data: {[key: string]: string};
}
