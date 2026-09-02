import { Injectable, Injector } from '@angular/core';
import { map, Observable, reduce, tap } from 'rxjs';
import { Db } from './storage/db';
import { DbTableWithBlob } from './storage/db-table-with-blob';
import { Arrays } from 'src/app/utils/arrays';
import { Console } from 'src/app/utils/console';

export interface StoredFileDto {
  key: string;
  dateStored: number | undefined;
  blob: Blob | undefined;
}

@Injectable({providedIn: 'root'})
export class StoredFilesService {

  private readonly db: Db;
  private readonly table: DbTableWithBlob<StoredFileDto>;

  constructor(
    injector: Injector,
  ) {
    this.table = new DbTableWithBlob<StoredFileDto>(injector, 'files', 'key', 'key', 'blob', () => 'image/jpeg');
    this.db = new Db(injector, 'trailence_files', true, false, [this.table]);
    this.db.start();
  }

  public getKey(owner: string, type: string, uuid: string): string {
    return owner + '#' + type + '#' + uuid;
  }

  public getFile$(owner: string, type: string, uuid: string): Observable<Blob> {
    return this.table.getBlobByKey$(this.getKey(owner, type, uuid));
  }

  public isStored$(owner: string, type: string, uuid: string): Observable<boolean> {
    return this.table.blobExists$(this.getKey(owner, type, uuid));
  }

  public store(owner: string, type: string, uuid: string, blob: Blob): Observable<any> {
    const key = this.getKey(owner, type, uuid);
    return this.table.addOne$({key, blob, dateStored: Date.now()}).pipe(
      tap({
        next: () => Console.info('File stored', key),
        error: e => Console.error('Error storing file', key, e)
      })
    );
  }

  public deleteFile(owner: string, type: string, uuid: string): Observable<any> {
    const key = this.getKey(owner, type, uuid);
    return this.table.deleteOne$(key).pipe(
      tap({
        next: r => Console.info('File removed', key, r),
        error: e => Console.error('Error deleting file', key, e)
      })
    );
  }

  public deleteFiles(type: string, toDelete: {owner: string, uuid: string}[]): Observable<any> {
    const keys = toDelete.map(d => this.getKey(d.owner, type, d.uuid));
    return this.table.deleteMany$(keys).pipe(
      tap({
        next: r => Console.info('Files removed', keys, r),
        error: e => Console.error('Error deleting files', keys, e)
      })
    );
  }

  public getTotalSize(type: string, maxDateStored: number, chunk: number = 100): Observable<[number,number]> {
    return this.table.listContentWithSize(chunk, key => key.indexOf('#' + type + '#') > 0).pipe(
      reduce((acc, value) => {
        let nt1 = acc[0];
        let nt2 = acc[1];
        for (const v of value) {
          nt1 += v.size;
          nt2 += (!v.dto.dateStored || v.dto.dateStored < maxDateStored ? v.size : 0);
        }
        return [nt1, nt2];
      }, ([0, 0])),
    );
  }

  public cleanExpiredFiles(type: string, maxDateStored: number, filter$?: (items: Partial<StoredFileDto>[]) => Promise<Partial<StoredFileDto>[]>): Observable<number> {
    return this.table.deleteWhen$(25, k => k.indexOf('#' + type + '#') > 0, dto => {
      const canDelete = !dto.dateStored || dto.dateStored < maxDateStored
      if (canDelete) Console.info('Expired file eligible to remove', dto.key, dto.dateStored, maxDateStored);
      return canDelete;
    }, filter$);
  }

  public cleanUnreferencedFiles(type: string, references: {owner: string, uuid: string}[], maxDateStored: number): Observable<string> {
    const keys = Arrays.mapToSet(references, r => this.getKey(r.owner, type, r.uuid));
    return this.table.deleteWhen$(25, k => !keys.has(k) && k.indexOf('#' + type + '#') > 0, dto => !!dto.dateStored && dto.dateStored < maxDateStored)
    .pipe(map(nb => {
      Console.info('Cleant unreferenced files', nb);
      return '' + nb;
    }));
  }

  public removeAllFiles(type: string, filterExclude: (owner: string, uuid: string) => boolean): Observable<any> {
    return this.table.deleteWhen$(25, k => {
      const i = k.indexOf('#' + type + '#');
      if (i < 0) return false;
      const owner = k.substring(0, i);
      const uuid = k.substring(i + type.length + 2);
      if (filterExclude(owner, uuid)) return false;
      return true;
    });
  }

}
