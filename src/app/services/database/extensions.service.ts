import { Injectable } from '@angular/core';
import { BehaviorSubject, filter, first, Observable, of } from 'rxjs';
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
  private updateFromServerTimeout: any = undefined;
  private readonly _loaded$ = new BehaviorSubject<boolean>(false);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly http: HttpService,
  ) {
    databaseService.registerStore({
      name: 'extensions',
      status$: this._syncStatus$,
      loaded$: this._loaded$,
      canSync$: of(true),
      hasPendingOperations$: of(false),
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
    return this._extensions$;
  }

  public saveExtension(extension: Extension): void {
    if (!this._db) return;
    const db = this._db;
    this._syncStatus$.pipe(
      filter(s => !s.inProgress),
      first(),
    ).subscribe(() => {
      if (db != this._db) return;
      const index = this._extensions$.value.findIndex(e => e.extension === extension.extension);
      if (index >= 0) {
        this._extensions$.value[index] = extension;
      } else {
        this._extensions$.value.push(extension);
      }
      db.table<DbItem>(EXTENSIONS_TABLE_NAME).put({
        version: extension.version,
        extension: extension.extension,
        data: extension.data
      });
      this._extensions$.next(this._extensions$.value);
      this._syncStatus$.value.needsUpdateFromServer = true;
      this._syncStatus$.value.hasLocalChanges = true;
      this._syncStatus$.next(this._syncStatus$.value);
    });
  }

  public removeExtension(extension: Extension): void {
    extension.markAsDeleted();
    this.saveExtension(extension);
  }

  private close(): void {
    if (this._db) {
      this._loaded$.next(false);
      this._extensions$.next([]);
      this._db = undefined;
      if (this.updateFromServerTimeout) clearTimeout(this.updateFromServerTimeout);
      this.updateFromServerTimeout = undefined;
    }
  }

  private load(db: Dexie): void {
    if (this._db) this.close();
    this._db = db;
    this._syncStatus$.value.needsUpdateFromServer = true;
    this._syncStatus$.next(this._syncStatus$.value);
    db.table<DbItem>(EXTENSIONS_TABLE_NAME).toArray().then(items => {
      this._extensions$.next(items.map(item => new Extension(item.version, item.extension, item.data)));
      this._loaded$.next(true);
    });
  }

  private triggerUpdatesFromServer(): void {
    if (!this._syncStatus$.value.needsUpdateFromServer) {
      this._syncStatus$.value.needsUpdateFromServer = true;
      this._syncStatus$.next(this._syncStatus$.value);
    }
  }

  private sync(): void {
    if (!this._db) return;
    const db = this._db;
    this._syncStatus$.value.inProgress = true;
    this._syncStatus$.next(this._syncStatus$.value);
    this.http.post<DbItem[]>(environment.apiBaseUrl + '/extensions/v1', this._extensions$.value.map(e => ({version: e.version, extension: e.extension, data: e.data}))).subscribe({
      next: list => {
        if (this._db !== db) return;
        if (!Arrays.sameContent(list, this._extensions$.value, (i1, i2) => i1.extension === i2.extension && i1.version === i2.version)) {
          Console.info('Extension(s) received from server: ', list.length);
          const extensions = list.map(item => new Extension(item.version, item.extension, item.data));
          this._extensions$.next(extensions);
          this._db.transaction('rw', [EXTENSIONS_TABLE_NAME], () => {
            db.table<DbItem>(EXTENSIONS_TABLE_NAME).clear();
            for (const extension of extensions) {
              db.table<DbItem>(EXTENSIONS_TABLE_NAME).put({
                version: extension.version,
                extension: extension.extension,
                data: extension.data
              });
            }
          });
        } else {
          Console.info('Extensions sync without change', list.length);
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
