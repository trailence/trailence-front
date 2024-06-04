import { Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import Dexie from 'dexie';
import { BehaviorSubject, Observable, combineLatest, map, mergeMap, of } from 'rxjs';
import { Store } from './store';

const DB_PREFIX = 'trailence_data_';
export const TRACK_TABLE_NAME = 'tracks';
export const TRAIL_TABLE_NAME = 'trails';
export const TRAIL_COLLECTION_TABLE_NAME = 'trail_collections';
export const TAG_TABLE_NAME = 'tags';
export const TRAIL_TAG_TABLE_NAME = 'trails_tags';

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {

  private _db = new BehaviorSubject<Dexie | undefined>(undefined);
  private _openEmail?: string;
  private _stores = new BehaviorSubject<Store<any,any,any>[]>([]);

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
      mergeMap(stores => stores.length === 0 ? of([]) : combineLatest(stores.map(store => store.syncStatus$))),
      map(status => status.map(s => s.inProgress).reduce((a,b) => a || b, false))
    );
  }

  registerStore(store: Store<any,any,any>): void {
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
    storesV1[TRAIL_TAG_TABLE_NAME] = '';
    db.version(1).stores(storesV1);
    this._db.next(db);
  }

}
