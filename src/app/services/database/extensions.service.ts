import { Injectable } from '@angular/core';
import { BehaviorSubject, filter, first, map, Observable, of } from 'rxjs';
import { Extension } from 'src/app/model/extension';
import { DatabaseService, EXTENSIONS_TABLE_NAME } from './database.service';
import { StoreSyncStatus } from './store';
import Dexie from 'dexie';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { Arrays } from 'src/app/utils/arrays';
import { Console } from 'src/app/utils/console';

@Injectable({
  providedIn: 'root'
})
export class ExtensionsService {

  private readonly _extensions$ = new BehaviorSubject<Extension[]>([]);
  private readonly _syncStatus$ = new BehaviorSubject<ExtensionsSyncStatus>(new ExtensionsSyncStatus());
  private _db?: Dexie;
  private readonly _loaded$ = new BehaviorSubject<boolean>(false);
  private _pendingOperation$ = new BehaviorSubject<number>(0);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly http: HttpService,
  ) {
    databaseService.registerStore({
      name: 'extensions',
      status$: this._syncStatus$,
      loaded$: this._loaded$,
      hasPendingOperations$: this._pendingOperation$.pipe(map(nb => nb > 0)),
      fireSyncStatus: () => this._syncStatus$.next(this._syncStatus$.value),
      syncFromServer: () => this.triggerUpdatesFromServer(),
      doSync: () => this.sync(),
    });
    this.databaseService.db$.subscribe(db => {
      if (db) this.load(db);
      else this.close();
    });
  }

  public getExtensions$(): Observable<Extension[]> {
    return this._extensions$.pipe(map(list => list.filter(e => e.version >= 0)));
  }

  public saveExtension(extensionName: string, createIfNeeded: boolean, updater: (extension: Extension) => void): void {
    if (!this._db) return;
    const db = this._db;
    this._pendingOperation$.next(this._pendingOperation$.value + 1);
    this._syncStatus$.pipe(
      filter(s => !s.inProgress),
      first(),
    ).subscribe(() => {
      if (db != this._db) return;
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
      db.table<DbItem>(EXTENSIONS_TABLE_NAME).put({
        version: e.version,
        extension: e.extension,
        data: e.data
      }).catch(e => {
        Console.warn("Error updating extensions table", e);
        return Promise.resolve();
      }).then(() => {
        this._pendingOperation$.next(this._pendingOperation$.value - 1);
      });
    });
  }

  public removeExtension(extensionName: string): void {
    this.saveExtension(extensionName, false, e => e.markAsDeleted());
  }

  private close(): void {
    if (this._db) {
      this._loaded$.next(false);
      this._extensions$.next([]);
      this._db = undefined;
      this._syncStatus$.next(new ExtensionsSyncStatus());
      this._pendingOperation$.next(0);
    }
  }

  private load(db: Dexie): void {
    if (this._db) this.close();
    this._db = db;
    this._pendingOperation$.next(0);
    this._syncStatus$.value.needsUpdateFromServer = true;
    this._syncStatus$.next(this._syncStatus$.value);
    db.table<DbItem>(EXTENSIONS_TABLE_NAME).toArray().then(items => {
      this._extensions$.next(items.map(item => new Extension(item.version, item.extension, item.data)));
      this._loaded$.next(true);
    }).catch(e => {
      Console.error('Error loading extensions', e);
    });
  }

  private triggerUpdatesFromServer(): void {
    this._syncStatus$.value.needsUpdateFromServer = true;
    this._syncStatus$.next(this._syncStatus$.value);
  }

  private sync(): void {
    if (!this._db) return;
    const db = this._db;
    this._pendingOperation$.pipe(
      filter(nb => nb === 0),
      first(),
    ).subscribe(() => { if (this._db === db) this.doSync(); });
  }

  private doSync(): void {
    if (!this._db) return;
    const db = this._db;
    this._syncStatus$.value.inProgress = true;
    this._syncStatus$.next(this._syncStatus$.value);
    Console.info('Sending updates for extensions:', this._extensions$.value.length);
    this.http.post<DbItem[]>(environment.apiBaseUrl + '/extensions/v1', this._extensions$.value.map(e => ({version: e.version, extension: e.extension, data: e.data}))).subscribe({
      next: async list => { // NOSONAR
        if (this._db !== db) return;
        try {
          if (!Arrays.sameContent(list, this._extensions$.value, (i1, i2) => i1.extension === i2.extension && i1.version === i2.version)) {
            Console.info('Extension(s) received from server: ', list.length);
            const extensions = list.map(item => new Extension(item.version, item.extension, item.data));
            this._extensions$.next(extensions);
            await this._db.transaction('rw', [EXTENSIONS_TABLE_NAME], async () => {
              await db.table<DbItem>(EXTENSIONS_TABLE_NAME).clear();
              for (const extension of extensions) {
                await db.table<DbItem>(EXTENSIONS_TABLE_NAME).put({
                  version: extension.version,
                  extension: extension.extension,
                  data: extension.data
                });
              }
            });
          } else {
            Console.info('Extensions sync without change', list.length);
          }
        } catch (e) {
          Console.error('Error computing extensions received from server', e);
        }
        this._syncStatus$.value.inProgress = false;
        this._syncStatus$.value.needsUpdateFromServer = false;
        this._syncStatus$.value.lastUpdateFromServer = Date.now();
        this._syncStatus$.value.hasLocalChanges = false;
        this._syncStatus$.next(this._syncStatus$.value);
      },
      error: e => {
        if (this._db !== db) return;
        Console.error('Error loading extensions', e);
        this._syncStatus$.value.inProgress = false;
        this._syncStatus$.next(this._syncStatus$.value);
      }
    });
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
