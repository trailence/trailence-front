import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, combineLatest, debounceTime, filter, map, Observable, takeWhile } from 'rxjs';
import { Extension } from 'src/app/model/extension';
import { DatabaseService, EXTENSIONS_TABLE_NAME } from './database.service';
import { StoreSyncStatus } from './store';
import Dexie from 'dexie';
import { NetworkService } from '../network/network.service';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { Arrays } from 'src/app/utils/arrays';

@Injectable({
  providedIn: 'root'
})
export class ExtensionsService {

  private _extensions$ = new BehaviorSubject<Extension[]>([]);
  private _syncStatus$ = new BehaviorSubject<ExtensionsSyncStatus>(new ExtensionsSyncStatus());
  private _db?: Dexie;
  private _lastSync = 0;
  private _syncTimeout?: any;

  constructor(
    private databaseService: DatabaseService,
    private network: NetworkService,
    private ngZone: NgZone,
    private http: HttpService,
  ) {
    databaseService.registerStore({status: this._syncStatus$, syncNow: () => this.syncNow()});
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
    const index = this._extensions$.value.findIndex(e => e.extension === extension.extension);
    if (index >= 0) {
      this._extensions$.value[index] = extension;
    } else {
      this._extensions$.value.push(extension);
    }
    this._db.table<DbItem>(EXTENSIONS_TABLE_NAME).put({
      version: extension.version,
      extension: extension.extension,
      data: extension.data
    })
    this._extensions$.next(this._extensions$.value);
    this._syncStatus$.value.needsUpdateFromServer = true;
    this._syncStatus$.value.hasLocalChanges = true;
    this._syncStatus$.next(this._syncStatus$.value);
  }

  public removeExtension(extension: Extension): void {
    extension.markAsDeleted();
    this.saveExtension(extension);
  }

  private close(): void {
    if (this._db) {
      this._extensions$.next([]);
      this._db = undefined;
    }
  }

  private load(db: Dexie): void {
    if (this._db) this.close();
    this._db = db;
    this._lastSync = 0;
    this._syncStatus$.value.needsUpdateFromServer = true;
    this._syncStatus$.next(this._syncStatus$.value);
    db.table<DbItem>(EXTENSIONS_TABLE_NAME).toArray().then(items => {
      this._extensions$.next(items.map(item => new Extension(item.version, item.extension, item.data)));
      combineLatest([
        this.network.server$,
        this._syncStatus$,
      ]).pipe(
        debounceTime(1000),
        map(([networkConnected, syncStatus]) => networkConnected && syncStatus.needsSync && !syncStatus.inProgress),
        filter(shouldSync => {
          if (!shouldSync) return false;
          if (Date.now() - this._lastSync < 30000) {
            this.ngZone.runOutsideAngular(() => {
              if (!this._syncTimeout) {
                this._syncTimeout = setTimeout(() => this._syncStatus$.next(this._syncStatus$.value), Math.max(1000, 30000 - (Date.now() - this._lastSync)));
              }
            });
            return false;
          }
          return true;
        }),
        debounceTime(1000),
        takeWhile(() => this._db === db)
      )
      .subscribe(() => {
        this._lastSync = Date.now();
        if (this._syncTimeout) clearTimeout(this._syncTimeout);
        this._syncTimeout = undefined;
        this.sync();
      });
    });
  }

  private syncNow(): void {
    this._lastSync = 0;
    if (this._syncTimeout) clearTimeout(this._syncTimeout);
    this._syncTimeout = undefined;
    this._syncStatus$.value.needsUpdateFromServer = true;
    this._syncStatus$.next(this._syncStatus$.value);
  }

  private sync(): void {
    if (!this._db) return;
    console.log('Sync extensions');
    const db = this._db;
    this._syncStatus$.value.inProgress = true;
    this._syncStatus$.next(this._syncStatus$.value);
    this.http.post<DbItem[]>(environment.apiBaseUrl + '/extensions/v1', this._extensions$.value.map(e => ({version: e.version, extension: e.extension, data: e.data}))).subscribe({
      next: list => {
        if (this._db !== db) return;
        if (!Arrays.sameContent(list, this._extensions$.value, (i1, i2) => i1.extension === i2.extension && i1.version === i2.version)) {
          console.log('Extension received from server: ', list.length);
          this._extensions$.next(list.map(item => new Extension(item.version, item.extension, item.data)));
        } else {
          console.log('Extensions sync without change', list.length);
        }
        this._syncStatus$.value.inProgress = false;
        this._syncStatus$.value.needsUpdateFromServer = false;
        this._syncStatus$.value.lastUpdateFromServer = Date.now();
        this._syncStatus$.value.hasLocalChanges = false;
        this._syncStatus$.next(this._syncStatus$.value);
      },
      error: e => {
        if (this._db !== db) return;
        console.error('Error loading extensions', e);
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
