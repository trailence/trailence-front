import { Injectable, Injector } from '@angular/core';
import { Observable, reduce } from 'rxjs';
import { FileStorage } from '../local-files/local-files.service';

@Injectable({providedIn: 'root'})
export class StoredFilesService {

  private readonly storage: FileStorage;

  constructor(
    injector: Injector,
  ) {
    this.storage = new FileStorage(injector, 'trailence_files', true, 'files', 'key', 'key', 'blob');
  }

  private getKey(owner: string, type: string, uuid: string): string {
    return owner + '#' + type + '#' + uuid;
  }

  public getFile$(owner: string, type: string, uuid: string): Observable<Blob> {
    return this.storage.getBlobByKey(this.getKey(owner, type, uuid));
  }

  public isStored$(owner: string, type: string, uuid: string): Observable<boolean> {
    return this.storage.blobExists(this.getKey(owner, type, uuid));
  }

  public store(owner: string, type: string, uuid: string, blob: Blob): Observable<any> {
    const key = this.getKey(owner, type, uuid);
    return this.storage.storeBlob({key, blob, dateStored: Date.now()});
  }

  public deleteFile(owner: string, type: string, uuid: string): Observable<any> {
    return this.storage.deleteEntry(this.getKey(owner, type, uuid));
  }

  public deleteFiles(type: string, toDelete: {owner: string, uuid: string}[]): Observable<any> {
    const keys = toDelete.map(d => this.getKey(d.owner, type, d.uuid));
    return this.storage.deleteEntries(keys);
  }

  public getTotalSize(type: string, maxDateStored: number, chunk: number = 100): Observable<[number,number]> {
    return this.storage.listContentWithSize(chunk, key => key.indexOf('#' + type + '#') > 0).pipe(
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

  public cleanExpiredFiles(type: string, maxDateStored: number): Observable<any> {
    return this.storage.deleteWhen(25, k => k.indexOf('#' + type + '#') > 0, dto => !dto.dateStored || dto.dateStored < maxDateStored);
  }

  public cleanUnreferencedFiles(type: string, references: {owner: string, uuid: string}[], maxDateStored: number): Observable<any> {
    const keys = references.map(r => this.getKey(r.owner, type, r.uuid));
    return this.storage.deleteWhen(25, k => !keys.includes(k) && k.indexOf('#' + type + '#') > 0, dto => dto.dateStored && dto.dateStored < maxDateStored);
  }

  public removeAllFiles(type: string, filterExclude: (owner: string, uuid: string) => boolean): Observable<any> {
    return this.storage.deleteWhen(25, k => {
      const i = k.indexOf('#' + type + '#');
      if (i < 0) return false;
      const owner = k.substring(0, i);
      const uuid = k.substring(i + type.length + 2);
      if (filterExclude(owner, uuid)) return false;
      return true;
    });
  }

}
