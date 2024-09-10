import { Injectable } from '@angular/core';
import { filter, from, Observable, of, throwError, throwIfEmpty } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import Dexie, { Table } from 'dexie';

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
    return from(this.table.add({key, blob}, key));
  }

  public delete(owner: string, type: string, uuid: string): void {
    if (this.table) this.table.delete(this.getKey(owner, type, uuid));
  }

  private getKey(owner: string, type: string, uuid: string): string {
    return owner + '#' + type + '#' + uuid;
  }

  private db?: Dexie;
  private openEmail?: string;
  private table?: Table<StoredFileDto, string>;

  private close() {
    if (this.db) {
      console.log('Close files DB')
      this.db.close();
      this.openEmail = undefined;
      this.db = undefined;
    }
  }

  private open(email: string): void {
    if (this.openEmail === email) return;
    this.close();
    console.log('Open files DB for user ' + email);
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
}
