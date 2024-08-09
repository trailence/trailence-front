import { Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import Dexie from 'dexie';
import { BehaviorSubject, Observable, combineLatest, from, map, of, switchMap } from 'rxjs';
import { StoreSyncStatus } from './store';

const DB_PREFIX = 'trailence_data_';
export const TRACK_TABLE_NAME = 'tracks';
export const TRAIL_TABLE_NAME = 'trails';
export const TRAIL_COLLECTION_TABLE_NAME = 'trail_collections';
export const TAG_TABLE_NAME = 'tags';
export const TRAIL_TAG_TABLE_NAME = 'trails_tags';
export const EXTENSIONS_TABLE_NAME = 'extensions';
export const SHARE_TABLE_NAME = 'shares';

interface RegisteredStore {
  status: Observable<StoreSyncStatus | null>;
  syncNow: () => void;
}

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {

  private _db = new BehaviorSubject<Dexie | undefined>(undefined);
  private _openEmail?: string;
  private _stores = new BehaviorSubject<RegisteredStore[]>([]);

  constructor(
    auth: AuthService,
  ) {
    auth.auth$.subscribe(
      auth => {
        if (!auth) this.close();
        else this.open(auth.email);
      }
    );
  }

  public get db$(): Observable<Dexie | undefined> { return this._db; }
  public get db(): Dexie | undefined { return this._db.value; }

  public get email(): string | undefined { return this._openEmail; }

  public get syncStatus(): Observable<boolean> {
    return this._stores.pipe(
      switchMap(stores => stores.length === 0 ? of([]) : combineLatest(stores.map(s => s.status))),
      map(status => status.map(s => !!s?.inProgress).reduce((a,b) => a || b, false))
    );
  }

  public get hasLocalChanges(): Observable<boolean> {
    return this._stores.pipe(
      switchMap(stores => stores.length === 0 ? of([]) : combineLatest(stores.map(s => s.status))),
      map(status => status.map(s => !!s?.hasLocalChanges).reduce((a,b) => a || b, false))
    );
  }

  public get lastSync(): Observable<number | undefined> {
    return this._stores.pipe(
      switchMap(stores => stores.length === 0 ? of([]) : combineLatest(stores.map(s => s.status))),
      map(status => {
        let last = undefined;
        for (const s of status) {
          if (!s?.lastUpdateFromServer) last = null;
          else if (last !== null && (last === undefined || s.lastUpdateFromServer < last)) last = s.lastUpdateFromServer;
        }
        return last ? last : undefined;
      })
    );
  }

  public syncNow(): void {
    this._stores.value.forEach(s => s.syncNow());
  }

  public resetAll(): void {
    const db = this._db.value;
    const email = this._openEmail;
    if (db && email) {
      this.close();
      Dexie.delete(DB_PREFIX + email)
      .then(() => this.open(email));
    }
  }

  registerStore(store: RegisteredStore): void {
    this._stores.value.push(store);
    this._stores.next(this._stores.value);
  }

  private close() {
    if (this._db.value) {
      console.log('Close DB')
      this._db.value.close();
      this._openEmail = undefined;
      this._db.next(undefined);
    }
  }

  private open(email: string): void {
    if (this._openEmail === email) return;
    this.close();
    console.log('Open DB for user ' + email);
    this._openEmail = email;
    const db = new Dexie(DB_PREFIX + email);
    const storesV1: any = {};
    storesV1[TRACK_TABLE_NAME] = 'id_owner';
    storesV1[TRAIL_TABLE_NAME] = 'id_owner';
    storesV1[TRAIL_COLLECTION_TABLE_NAME] = 'id_owner';
    storesV1[TAG_TABLE_NAME] = 'id_owner';
    storesV1[TRAIL_TAG_TABLE_NAME] = 'key';
    storesV1[EXTENSIONS_TABLE_NAME] = 'extension';
    storesV1[SHARE_TABLE_NAME] = 'key';
    db.version(1).stores(storesV1);
    this._db.next(db);
  }

}
