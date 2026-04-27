import { Injector } from '@angular/core';
import { LocalFilesService } from '../../local-files/local-files.service';
import { DbTable, DbTableMigration } from './db-table';
import Dexie, { Table } from 'dexie';
import { Console } from 'src/app/utils/console';
import { ProgressService } from '../../progress/progress.service';
import { I18nService } from '../../i18n/i18n.service';
import { BinaryContent } from 'src/app/utils/binary-content';
import { from, map, Observable, switchMap, throwIfEmpty } from 'rxjs';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';

export class DbTableWithBlob<DTO> extends DbTable<DTO> {

  protected localFiles: LocalFilesService;

  constructor(
    injector: Injector,
    name: string,
    schema: string,
    dtoKeyField: string,
    protected readonly dtoBlobField: string,
    protected readonly getContentType: (dto: Partial<DTO>) => string | undefined = () => undefined,
  ) {
    super(injector, name, schema, dtoKeyField);
    this.localFiles = injector.get(LocalFilesService);
    if (this.localFiles.supported()) {
      this.addMigration({
        name: 'to local files',
        version: 10600,
        migration: (injector, dexie, table, localDir) => this.migrateToLocalFiles(injector, dexie, table, localDir),
      } as DbTableMigration);
      this.toDtos = fromTable => Promise.all(fromTable.map(dto => this.augmentWithBlob(dto)));
      this.fromDtos = dtos => Promise.all(dtos.map(dto => this.storeAndRemoveBlob(dto)));
      this.deleted = keys => this.deleteFiles(keys);
    }
  }

  private async migrateToLocalFiles(injector: Injector, dexie: Dexie, table: Table, localDir: string) {
    const keys = await table.toCollection().primaryKeys();
    if (keys.length === 0) return;
    Console.info(keys.length + ' entries to migrate to local files from ' + dexie.name + '/' + this.name);
    const progress = injector.get(ProgressService).getOrCreate('update-migration', injector.get(I18nService).texts.update.updating, keys.length);
    let workDone = 0;
    const next = async (from: number) => {
      const end = Math.min(keys.length, from + 25);
      const keysToProcess = keys.slice(from, end);
      const dtosWithBlob = await table.bulkGet(keysToProcess)
      const dtosWithoutBlob = await Promise.all(
        dtosWithBlob.map(dto => {
          const blob = dto[this.dtoBlobField];
          if (!blob) {
            progress.addWorkDone(1);
            workDone++;
            return Promise.resolve(dto);
          }
          return this.localFiles.saveBinaryFile(localDir, dto[this.dtoKeyField], new BinaryContent(blob))
          .then(() => {
            progress.addWorkDone(1);
            workDone++;
            delete dto[this.dtoBlobField];
            return dto;
          });
        })
      );
      await table.bulkPut(dtosWithoutBlob);
      if (end === keys.length) return;
      await next(from + 25);
    };
    await next(0);
    if (workDone < keys.length) progress.addWorkDone(keys.length - workDone);
  }

  private async augmentWithBlob(fromTable: Partial<DTO>) {
    (fromTable as any)[this.dtoBlobField] = await this.localFiles.readBlob(this.localDir!, (fromTable as any)[this.dtoKeyField] as string, this.getContentType(fromTable));
    return fromTable as DTO;
  }

  private async storeAndRemoveBlob(dto: DTO) {
    const key = (dto as any)[this.dtoKeyField] as string;
    const blob = (dto as any)[this.dtoBlobField] as Blob;
    if (!key) throw new Error('Missing key on DTO');
    if (!blob) throw new Error('Missing blob for key: ' + key);
    await this.localFiles.saveBinaryFile(this.localDir!, key, new BinaryContent(blob));
    dto = {...dto};
    delete (dto as any)[this.dtoBlobField];
    return dto;
  }

  private async deleteFiles(keys: string[]) {
    if (keys.length === 1) await this.localFiles.deleteFile(this.localDir!, keys[0]);
    else await this.localFiles.deleteFiles(this.localDir!, keys);
  }

  public getBlobByKey$(key: string, contentType?: string): Observable<Blob> {
    if (this.localFiles.supported()) return from(this.localFiles.readBlob(this.localDir!, key, contentType));
    return this.getByKey$(key).pipe(
      map(dto => (dto as any)?.[this.dtoBlobField]),
      filterDefined(),
      throwIfEmpty(() => new Error('File ' + key + ' not found'))
    );
  }

  public blobExists$(key: string): Observable<boolean> {
    if (this.localFiles.supported()) return from(this.localFiles.fileExists(this.localDir!, key));
    return this.exists$(key);
  }

  public listContentWithSize(chunk: number, keyPredicate?: (key: string) => boolean, dtoPredicate?: (dto: Partial<DTO>) => boolean): Observable<{dto: Partial<DTO>, size: number}[]> {
    return this.onReady().pipe(switchMap(table => new Observable<{dto: Partial<DTO>, size: number}[]>(subscriber => {
      if (!this.isStillValid(table)) {
        subscriber.complete();
        return;
      }
      let keys$ = table.toCollection().primaryKeys();
      if (keyPredicate) keys$ = keys$.then(k => k.filter(keyPredicate));
      keys$.then(keys => {
        if (keys.length === 0 || !this.isStillValid(table)) {
          subscriber.complete();
          return;
        }
        const next = (i:number) => {
          if (!this.isStillValid(table)) {
            subscriber.complete();
            return;
          }
          const end = Math.min(i + chunk, keys.length);
          const bunch = keys.slice(i, end);
          let nexts$: Promise<{dto: Partial<DTO>, size: number}[]>;
          if (this.localFiles.supported()) {
            const mapWithSizes = (dtos: (Partial<DTO> | undefined)[], sizes: {filename: string, size: number}[]) =>
              dtos.map(dto => {
                if (!dto) return undefined;
                const size = sizes.find(s => s.filename === (dto as any)[this.dtoKeyField])?.size ?? 0;
                return {dto, size};
              }).filter(dto => !!dto);
            if (dtoPredicate) {
              nexts$ = table.bulkGet(bunch).then(dtos => {
                const filtered: Partial<DTO>[] = this.isStillValid(table) ? dtos.filter(dto => !!dto && dtoPredicate(dto)) as Partial<DTO>[] : [];
                if (filtered.length === 0) return [];
                return this.localFiles.filesSize(this.localDir!, filtered.map(dto => (dto as any)[this.dtoKeyField])).then(sizes => mapWithSizes(filtered, sizes));
              });
            } else {
              nexts$ = Promise.all([
                table.bulkGet(bunch),
                this.localFiles.filesSize(this.localDir!, bunch)
              ]).then(([dtos, sizes]) => mapWithSizes(dtos, sizes));
            }
          } else {
            nexts$ = table.bulkGet(bunch).then(fromTable => {
              const dtos = fromTable.filter(dto => !!dto && (dtoPredicate ? dtoPredicate(dto) : true)) as DTO[];
              return dtos.map(dto => ({dto, size: ((dto as any)[this.dtoBlobField] as Blob | undefined)?.size ?? 0}));
            });
          }
          nexts$.then(n => {
            if (!this.isStillValid(table)) {
              subscriber.complete();
              return;
            }
            subscriber.next(n);
            if (end < keys.length) next(end);
            else subscriber.complete();
          });
        }
        next(0);
      });
    })));
  }

}
