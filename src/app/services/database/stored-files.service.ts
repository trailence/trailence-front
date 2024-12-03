import { Injectable } from '@angular/core';
import { filter, from, Observable, of, throwError, throwIfEmpty } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import Dexie, { Table } from 'dexie';
import { Console } from 'src/app/utils/console';

@Injectable({providedIn: 'root'})
export class StoredFilesService {

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

  public getFile$(owner: string, type: string, uuid: string): Observable<Blob> {
    if (!this.table) return throwError(() => new Error('File database not open'));
    return from(this.table.where('key').equals(this.getKey(owner, type, uuid)).first().then(entry => entry?.blob)).pipe(
      filter(blob => !!blob),
      throwIfEmpty(() => new Error('File ' + this.getKey(owner, type, uuid) + ' not found'))
    );
  }

  public isStored$(owner: string, type: string, uuid: string): Observable<boolean> {
    if (!this.table) return of(false);
    return from(this.table.where('key').equals(this.getKey(owner, type, uuid)).primaryKeys().then(pks => pks.length > 0));
  }

  public store(owner: string, type: string, uuid: string, blob: Blob): Observable<any> {
    if (!this.table) return of(undefined);
    const key = this.getKey(owner, type, uuid);
    return from(this.table.add({key, blob, dateStored: Date.now()}, key));
  }

  public delete(owner: string, type: string, uuid: string): void {
    if (this.table) this.table.delete(this.getKey(owner, type, uuid));
  }

  private getKey(owner: string, type: string, uuid: string): string {
    return owner + '#' + type + '#' + uuid;
  }

  public getTotalSize(type: string, maxDateStored: number): Observable<[number,number]> {
    if (!this.table) return of([0,0]);
    const t = this.table;
    return from(t.toCollection().primaryKeys()
    .then(keys => keys.filter(k => k.indexOf('#' + type + '#') > 0))
    .then(keys => {
      if (keys.length === 0 || t !== this.table) return Promise.resolve([0,0]) as Promise<[number,number]>; // NOSONAR
      const next: (i:number,total1:number,total2:number) => Promise<[number,number]> = (i, total1, total2) => {
        if (t !== this.table) return Promise.resolve([total1, total2]);
        let next$: Promise<[number,number]> = t.get(keys[i])
        .then(dto => {
          if (!dto) return [total1, total2];
          const s = dto.blob.size;
          const nt1 = total1 + s;
          const nt2 = total2 + (!dto.dateStored || dto.dateStored < maxDateStored ? s : 0);
          return [nt1, nt2];
        });
        if (i < keys.length - 1) next$ = next$.then(([t1,t2]) => next(i + 1, t1, t2));
        return next$;
      }
      return next(0,0,0);
    }));
  }

  public cleanExpired(type: string, maxDateStored: number): Observable<any> {
    if (!this.table) return of(null);
    const t = this.table;
    return from(t.toCollection().primaryKeys()
    .then(keys => keys.filter(k => k.indexOf('#' + type + '#') > 0))
    .then(keys => {
      if (keys.length === 0 || t !== this.table) return Promise.resolve([]);
      const next: (i:number,toRemove:string[]) => Promise<string[]> = (i,toRemove) => {
        if (t !== this.table) return Promise.resolve([] as string[]);
        let next$ = t.get(keys[i])
        .then(dto => {
          if (!dto) return toRemove;
          if (!dto.dateStored || dto.dateStored < maxDateStored) return [...toRemove, keys[i]];
          return toRemove;
        });
        if (i < keys.length - 1) next$ = next$.then(list => next(i + 1, list));
        return next$;
      }
      return next(0,[]);
    }).then(toRemove => {
      if (t !== this.table) return;
      Console.info('Cleaning', type, toRemove.length);
      return t.bulkDelete(toRemove);
    }));
  }

  public removeAll(type: string, filterExclude: (owner: string, uuid: string) => boolean): Observable<any> {
    if (!this.table) return of(null);
    const t = this.table;
    return from(t.toCollection().primaryKeys()
    .then(keys => keys.filter(k => {
      const i = k.indexOf('#' + type + '#');
      if (i < 0) return false;
      const owner = k.substring(0, i);
      const uuid = k.substring(i + type.length + 2);
      if (filterExclude(owner, uuid)) return false;
      return true;
    }))
    .then(toRemove => {
      if (t !== this.table) return;
      Console.info('Removing files', type, toRemove.length);
      return t.bulkDelete(toRemove);
    }));
  }

  private db?: Dexie;
  private openEmail?: string;
  private table?: Table<StoredFileDto, string>;

  private close() {
    if (this.db) {
      Console.info('Close files DB')
      this.db.close();
      this.openEmail = undefined;
      this.db = undefined;
    }
  }

  private open(email: string): void {
    if (this.openEmail === email) return;
    this.close();
    Console.info('Open files DB for user ' + email);
    this.openEmail = email;
    const db = new Dexie('trailence_files_' + email);
    const schemaV1: any = {};
    schemaV1['files'] = 'key';
    db.version(1).stores(schemaV1);
    this.table = db.table<StoredFileDto, string>('files');
    this.db = db;
  }
}

interface StoredFileDto {
  key: string;
  blob: Blob;
  dateStored: number;
}
