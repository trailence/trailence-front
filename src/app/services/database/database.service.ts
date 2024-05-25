import { Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import Dexie from 'dexie';
import { BehaviorSubject, Observable } from 'rxjs';

const DB_PREFIX = 'trailence_data_';
export const TRACK_TABLE_NAME = 'tracks';
export const TRAIL_TABLE_NAME = 'trails';
export const TRAIL_COLLECTION_TABLE_NAME = 'trail_collections';

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {

  private _db = new BehaviorSubject<Dexie | undefined>(undefined);
  private _openEmail?: string;

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
    db.version(1).stores(storesV1);
    this._db.next(db);
  }

}
