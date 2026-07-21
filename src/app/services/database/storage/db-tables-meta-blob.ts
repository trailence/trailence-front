import { Injector } from '@angular/core';
import { DbTable } from './db-table';
import { LocalFilesService } from '../../local-files/local-files.service';
import { catchError, concat, filter, first, forkJoin, from, last, map, Observable, switchMap, throwError, zip } from 'rxjs';
import { BinaryContent } from 'src/app/utils/binary-content';
import { Table } from 'dexie';
import { ProgressService } from '../../progress/progress.service';
import { I18nService } from '../../i18n/i18n.service';

export interface BlobDto {
  key: string;
  blob: Blob;
}

export class DbTablesMetaBlob<MetaDto> {

  constructor(
    injector: Injector,
    private readonly tablesPrefix: string,
    metaTableSuffix: string,
    private readonly blobTableSuffix: string,
    metaTableSchema: string,
    private readonly metaDtoKeyField: string,
  ) {
    this.localFiles = injector.get(LocalFilesService);
    this.metaTable = new DbTable<MetaDto>(injector, tablesPrefix + '_' + metaTableSuffix, metaTableSchema, metaDtoKeyField);
    this.blobTable = new DbTable<BlobDto>(injector, tablesPrefix + '_' + blobTableSuffix, 'key', 'key');
    if (this.localFiles.supported()) {
      this.blobTable.addMigration({
        name: 'to local files',
        version: 10600,
        migration: (injector, dexie, table, localDir) => this.migrateToLocalFiles(injector, table, localDir),
      });
      this.blobTable.onMigrationsDone = () => {
        this.blobTable = undefined;
      };
    }
  }

  private readonly localFiles: LocalFilesService;
  private readonly metaTable: DbTable<MetaDto>;
  private blobTable?: DbTable<BlobDto>;

  public getTables(): DbTable<any>[] {
    return [this.metaTable, this.blobTable!];
  }

  private async migrateToLocalFiles(injector: Injector, table: Table, localDir: string) {
    const nb = await table.count();
    if (nb > 0) {
      const progress = injector.get(ProgressService).getOrCreate('update-migration', injector.get(I18nService).texts.update.updating, nb);
      let workDone = 0;
      await table.each(async (dto: BlobDto) => {
        await this.localFiles.saveBinaryFile(localDir, dto.key, new BinaryContent(dto.blob));
        progress.addWorkDone(1);
        workDone++;
      });
      await table.clear();
      if (workDone < nb) progress.addWorkDone(nb - workDone);
    }
    this.blobTable = undefined;
  }

  public get metadata() { return this.metaTable; }

  public getBlob$(key: string, contentType?: string): Observable<Blob | undefined> {
    if (this.blobTable) return this.blobTable.getByKey$(key).pipe(map(dto => dto?.blob));
    return this.getFile$(key, contentType);
  }

  public setMany$(metas: MetaDto[], blobs: BlobDto[]): Observable<boolean> {
    const setMetas$ = this.metaTable.setMany$(metas);
    const setBlobs$ = this.blobTable ? this.blobTable.setMany$(blobs) : this.storeManyBlobs$(blobs);
    return zip([setMetas$, setBlobs$]).pipe(
      catchError(e => {
        const keys = metas.map(m => (m as any)[this.metaDtoKeyField]);
        return forkJoin([
          this.metaTable.deleteMany$(keys),
          this.blobTable ? this.blobTable.deleteMany$(keys) : this.deleteManyBlobs$(keys),
        ]).pipe(switchMap(() => throwError(() => e)))
      }),
      map(() => true)
    );
  }

  public deleteMany$(keys: string[]): Observable<boolean> {
    const deleteMeta$ = this.metaTable.deleteMany$(keys);
    const deleteBlobs$ = this.blobTable ? this.blobTable.deleteMany$(keys) : this.deleteManyBlobs$(keys);
    return zip([deleteMeta$, deleteBlobs$]).pipe(map(() => true));
  }

  public deleteAll$(): Observable<boolean> {
    const deleteMeta$ = this.metaTable.deleteAll$();
    const deleteBlobs$ = this.blobTable ? this.blobTable.deleteAll$() : this.deleteAllBlobs$();
    return zip([deleteMeta$, deleteBlobs$]).pipe(map(() => true));
  }

  private get localDir$() {
    return this.metaTable.whenReady$().pipe(
      filter(info => !!info),
      switchMap(info => info.db.tableLocalDir$(this.tablesPrefix + '_' + this.blobTableSuffix)),
      first(),
    );
  }

  private getFile$(key: string, contentType?: string): Observable<Blob | undefined> {
    return this.localDir$.pipe(
      switchMap(localDir => this.localFiles.readBlob(localDir, key, contentType).catch(() => undefined)),
    );
  }

  private storeManyBlobs$(blobs: BlobDto[]): Observable<boolean> {
    return this.localDir$.pipe(
      switchMap(localDir => {
        const storeFiles$ = from(blobs).pipe(
          switchMap(blob => this.localFiles.saveBinaryFile(localDir, blob.key, new BinaryContent(blob.blob)))
        );
        return concat(storeFiles$).pipe(
          last()
        );
      }),
    );
  }

  private deleteManyBlobs$(keys: string[]): Observable<boolean> {
    return this.localDir$.pipe(
      switchMap(localDir => this.localFiles.deleteFiles(localDir, keys)),
      map(() => true),
    );
  }

  private deleteAllBlobs$(): Observable<boolean> {
    return this.localDir$.pipe(
      switchMap(localDir => this.localFiles.deleteAllFiles(localDir)),
      map(() => true),
    );
  }

}
