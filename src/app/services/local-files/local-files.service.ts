import { EventEmitter, Injectable, Injector } from '@angular/core';
import { Platform } from '@ionic/angular/standalone';
import { BinaryContent } from 'src/app/utils/binary-content';
import LocalFiles from './local-files';
import { AuthService } from '../auth/auth.service';
import { Console } from 'src/app/utils/console';
import Dexie, { Table } from 'dexie';
import { BehaviorSubject, debounceTime, filter, from, map, Observable, of, Subscription, switchMap, tap, throwError, throwIfEmpty } from 'rxjs';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { ProgressService } from '../progress/progress.service';
import { I18nService } from '../i18n/i18n.service';

type waitingOperation = {name: string, operation: () => Promise<any>, resolve: (result: any) => void, reject: (reason: any) => void};

@Injectable({providedIn: 'root'})
export class LocalFilesService {

  private readonly support: boolean;

  constructor(
    readonly platform: Platform,
  ) {
    this.support = this.platform.is('capacitor');
  }

  public supported(): boolean {
    return this.support;
  }

  private readonly _waiting = new Map<string, waitingOperation[]>();

  private operation<T>(dir: string, filename: string, name: string, operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const op: waitingOperation = {name, operation, resolve, reject};
      const path = dir + '/' + filename;
      let waiting = this._waiting.get(path);
      if (waiting === undefined) {
        waiting = [];
        this._waiting.set(path, waiting);
        this.executeOperation(path, op, waiting);
      } else {
        Console.info('Operation ' + name + ' on local file ' + path + ' waiting for previous to finish');
        waiting.push(op);
      }
    });
  }

  private multipleOperation<T>(dir: string, files: string[], name: string, operation: () => Promise<T>, previousTryAgain?: waitingOperation): Promise<T> {
    if (files.length === 1) return this.operation(dir, files[0], name, operation);
    const paths = files.map(filename => dir + '/' + filename);
    if (paths.every(path => !this._waiting.has(path))) {
      // can start now
      Console.info('Starting multiple file operation ' + name + ' on ' + dir, files);
      paths.forEach(path => this._waiting.set(path, []));
      const next = () => {
        for (const path of paths) {
          const waiting = this._waiting.get(path);
          if (waiting === undefined) continue; // should not happen
          if (waiting.length === 0) {
            this._waiting.delete(path);
          } else {
            setTimeout(() => this.nextOperation(path), 0);
          }
        }
      };
      return operation()
      .then(result => {
        Console.info('Multiple file operation ' + name + ' on ' + dir + ' done.');
        next();
        return result;
      })
      .catch(error => {
        Console.error('Multiple file operation ' + name + ' on ' + dir + ' failed', error);
        next();
        throw error;
      });
    }
    // some files have operation
    Console.info('Multiple operation ' + name + ' waiting on ' + dir, files);
    return new Promise<T>((resolve, reject) => {
      if (paths.every(path => !this._waiting.has(path))) {
        this.multipleOperation(dir, files, name, () => operation().then(resolve).catch(reject));
        return;
      }
      const tryAgain: waitingOperation = {
        name,
        operation: () => this.multipleOperation(dir, files, name, operation, tryAgain),
        resolve,
        reject
      };
      for (const path of paths) {
        let waiting = this._waiting.get(path);
        if (waiting === undefined) continue;
        const index = previousTryAgain ? waiting.indexOf(previousTryAgain) : -1;
        if (index >= 0) waiting.splice(index, 1);
        waiting.push(tryAgain);
      }
    });
  }

  private executeOperation(path: string, op: waitingOperation, waiting: waitingOperation[]): void {
    const next = () => {
      if (waiting.length === 0)
        this._waiting.delete(path);
      else
        setTimeout(() => this.nextOperation(path), 0);
    };
    Console.info('Starting local file operation on ' + path + ': ' + op.name);
    op.operation()
    .then(result => {
      Console.info('Local file operation done on ' + path + ': ' + op.name);
      next();
      op.resolve(result);
    })
    .catch(error => {
      Console.error('Local file operation failed on ' + path + ': ' + op.name, error);
      next();
      op.reject(error);
    });
  }

  private nextOperation(path: string): void {
    let waiting = this._waiting.get(path);
    if (waiting === undefined) {
      Console.warn('Next operation without operation?', path);
      return;
    }
    if (waiting.length === 0) {
      Console.warn('Next operation with empty list?', path);
      this._waiting.delete(path);
      return;
    }
    const next = waiting.splice(0, 1)[0];
    this.executeOperation(path, next, waiting);
  }


  public fileExists(dir: string, filename: string): Promise<boolean> {
    return this.operation(dir, filename, 'fileExists', () => LocalFiles.fileExists({dir, filename}).then(r => r.exists));
  }

  public filesSize(dir: string, files: string[]): Promise<{filename: string, size: number}[]> {
    if (files.length === 0) return Promise.resolve([]);
    return this.multipleOperation(dir, files, 'filesSize', () => LocalFiles.getFilesSize({dir, files}).then(r => r.files));
  }

  public deleteFile(dir: string, filename: string): Promise<any> {
    return this.operation(dir, filename, 'delete', () => LocalFiles.deleteFile({dir, filename}));
  }

  public deleteFiles(dir: string, files: string[]): Promise<any> {
    if (files.length === 0) return Promise.resolve();
    return this.multipleOperation(dir, files, 'delete', () => LocalFiles.deleteFiles({dir, files}));
  }

  public saveBinaryFile(dir: string, filename: string, data: BinaryContent): Promise<boolean> {
    return this.operation(dir, filename, 'saveBinary', () =>
      LocalFiles.saveBinaryFile({dir, filename, size: data.getSize()})
      .then(init => data.toUint8Array().then(content =>this.saveBinaryChunk(init.id, init.maxChunkSize, content, 0)))
      .then(() => true)
    );
  }

  private saveBinaryChunk(id: number, maxChunkSize: number, content: Uint8Array, offset: number): Promise<any> {
    const end = Math.min(offset + maxChunkSize, content.byteLength);
    const data = btoa(content.slice(offset, end).reduce((data, byte) => {
      return data + String.fromCharCode(byte); // NOSONAR
    }, ''));
    return LocalFiles.saveBinaryFileChunk({id, data})
    .then(r => {
      if (end === content.byteLength) return r;
      return this.saveBinaryChunk(id, maxChunkSize, content, end);
    });
  }

  public readBlob(dir: string, filename: string, contentType?: string): Promise<Blob> {
    return this.operation(dir, filename, 'readBlob', () =>
      LocalFiles.readBinaryFile({dir, filename})
      .then(init => {
        if (init.chunks === 0) return new Blob([], {type: contentType});
        if (init.chunks === 1) return BinaryContent.b64toBlob(init.data, contentType);
        return this.readBlobChunk(init.id!, init.chunks, 2, init.data, contentType);
      })
    );
  }

  private readBlobChunk(id: number, nbChunks: number, chunkIndex: number, b64: string, contentType?: string): Promise<Blob> {
    return LocalFiles.readBinaryFileChunk({id})
    .then(r => {
      const b = b64 + r.data;
      if (chunkIndex === nbChunks) return BinaryContent.b64toBlob(b, contentType);
      return this.readBlobChunk(id, nbChunks, chunkIndex + 1, b, contentType);
    });
  }

  public saveJsonl(dir: string, filename: string, linesGenerator: (from: number, limit: number) => Promise<{lines: string[], hasMore: boolean}>, chunkSize: number = 250): Promise<any> {
    return this.operation(dir, filename, 'saveJsonl', () =>
      linesGenerator(0, chunkSize)
      .then(generated =>
        LocalFiles.saveJsonlFile({dir, filename, lines: generated.lines, more: generated.hasMore})
        .then(r => {
          if (r.id) return this.saveJsonlChunk(r.id, linesGenerator, chunkSize, chunkSize);
          return undefined;
        })
      )
    );
  }

  private saveJsonlChunk(id: number, linesGenerator: (from: number, limit: number) => Promise<{lines: string[], hasMore: boolean}>, from: number, chunkSize: number = 250): Promise<any> {
    return linesGenerator(from, chunkSize)
    .then(generated =>
      LocalFiles.saveJsonlFileChunk({id, lines: generated.lines, more: generated.hasMore})
      .then(() => {
        if (generated.hasMore) return this.saveJsonlChunk(id, linesGenerator, from + chunkSize, chunkSize);
        return undefined;
      })
    );
  }

  public readJsonl(dir: string, filename: string, linesConsumer: (lines: string[]) => Promise<any>): Promise<any> {
    return this.operation(dir, filename, 'readJsonl', () =>
      LocalFiles.readJsonlFile({dir, filename})
      .then(r => linesConsumer(r.lines).then(() => {
        if (!r.id) return r.lines.length > 0 ? linesConsumer([]) : undefined;
        return this.readJsonlChunk(r.id, linesConsumer);
      }))
    );
  }

  private readJsonlChunk(id: number, linesConsumer: (lines: string[]) => Promise<any>): Promise<any> {
    return LocalFiles.readJsonlFileChunk({id})
    .then(r => linesConsumer(r.lines).then(() => {
      if (r.end) return linesConsumer([]);
      return this.readJsonlChunk(id, linesConsumer);
    }));
  }

}

const VERSION_TABLE_NAME = 'version';

export class FileStorage {

  constructor(
    private readonly injector: Injector,
    private readonly dbName: string,
    dbByUser: boolean,
    private readonly tableName: string,
    private readonly tableKeys: string,
    private readonly dtoKeyField: string,
    private readonly dtoBlobField: string,
  ) {
    this.localService = injector.get(LocalFilesService);
    if (dbByUser) {
      injector.get(AuthService).userChanged$.subscribe(
        auth => {
          if (auth) this.open(auth.email);
          else this.close();
        }
      );
    } else {
      this.open();
    }
  }

  private openEmail?: string;
  private db?: Dexie;
  private table?: Table;
  private readonly localService: LocalFilesService;
  private dir?: string;

  private readonly ready$ = new BehaviorSubject<boolean>(false);
  private readonly dbChanged$ = new EventEmitter<boolean>();
  private dbChangedSubscription?: Subscription;

  private open(email?: string): void {
    if (this.openEmail === email) return;
    this.close();
    Console.info('Open DB ' + this.dbName + (email ? ' for user ' + email : ''));
    const dbName = this.dbName + (email ? '_' + email : '');
    this.dir = (email ? email + '/' : '') + this.dbName;
    this.openEmail = email;
    let openDb$: Promise<Dexie | undefined> = new Promise<Dexie | undefined>(resolve => {
      const db = new Dexie(dbName);
      const schemaV1: any = {};
      schemaV1[this.tableName] = this.tableKeys;
      schemaV1[VERSION_TABLE_NAME] = 'version';
      db.version(1).stores(schemaV1);
      resolve(db);
    });
    // migration
    let migrationDone = false;
    if (this.localService.supported()) {
      const open$ = openDb$;
      openDb$ = Dexie.exists(dbName).then(exists => {
        if (exists) return open$;
        if (this.openEmail !== email) return undefined;
        return this.localService.fileExists(this.dir!, this.tableName + '.jsonl').then(backupExists => {
          if (!backupExists) return open$;
          return open$.then(db => db ? this.restoreBackup(db).then(() => db) : db);
        });
      })
      .then(db => {
        if (!db || this.openEmail !== email) return undefined;
        const t = db.table(VERSION_TABLE_NAME);
        return t.limit(1).first().then(item => {
          if (item) return db;
          migrationDone = true;
          return this.migrateToLocalFiles(db)
          .then(() => t.add({version: 10600}))
          .then(() => db);
        });
      });
    } else {
      openDb$ = openDb$.then(db => {
        if (!db || this.openEmail !== email) return undefined;
        const t = db.table(VERSION_TABLE_NAME);
        return t.limit(1).first().then(item => {
          if (!item) return t.add({version: 10600}).then(() => db);
          return db;
        });
      });
    }
    openDb$.then(db => {
      if (db && this.openEmail === email) {
        this.db = db;
        this.table = db.table(this.tableName);
        this.ready$.next(true);
        if (this.localService.supported()) {
          let pending = false;
          this.dbChangedSubscription = this.dbChanged$.pipe(
            debounceTime(5000),
            switchMap(() => {
              if (pending) {
                this.dbChanged$.emit(true);
                return of(undefined);
              } else {
                pending = true;
                return this.storeBackup().pipe(tap(() => pending = false));
              }
            })
          ).subscribe();
        }
      }
      if (migrationDone) this.dbChanged$.emit(true); // migration => trigger a new backup
    })
    .catch(e => {
      Console.error('Error opening DB ' + this.dbName, e);
    });
  }

  private close(): void {
    if (!this.db) return;
    Console.info('Close DB ' + this.dbName + (this.openEmail ? ' for user ' + this.openEmail : ''));
    this.dbChangedSubscription?.unsubscribe();
    this.dbChangedSubscription = undefined;
    this.ready$.next(false);
    this.db.close();
    this.openEmail = undefined;
    this.db = undefined;
  }

  private storeBackup(): Observable<any> {
    Console.info('Backuping DB ' + this.dbName);
    const t = this.table!;
    const dir = this.dir!;
    const filename = this.tableName + '.jsonl';
    const v = this.db!.table(VERSION_TABLE_NAME);
    return from(
      t.toCollection().primaryKeys()
      .then(keys =>
        this.localService.saveJsonl(
          dir,
          filename,
          (from, limit) => {
            const end = Math.min(keys.length, from + limit);
            const hasMore = end < keys.length;
            let lines = t.bulkGet(keys.slice(from, end))
              .then(dtos => dtos.map(dto => JSON.stringify(dto)))
              .then(lines => ({lines, hasMore}));
            if (from === 0) {
              const tableLines = lines;
              lines = v.limit(1).first()
                .then(version => tableLines.then(r => {
                  r.lines.splice(0, 0, JSON.stringify(version));
                  return r;
                }));
            }
            return lines;
          },
          1000
        )
      )
      .then(() => Console.info('Backup done for DB ' + dir + '/' + filename))
      .catch(e => {
        Console.error('Error storing backup for ' + dir + '/' + filename, e);
        this.localService.deleteFile(dir, filename);
      })
    );
  }

  private restoreBackup(db: Dexie): Promise<any> {
    Console.info('Restoring DB ' + this.dbName);
    const t = db.table(this.tableName);
    const v = db.table(VERSION_TABLE_NAME);
    let versionLineRead = false;
    return this.localService.readJsonl(this.dir!, this.tableName + '.jsonl', lines => {
      lines = lines.map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length === 0) return Promise.resolve();
      const json = lines.map(l => {
        try { return JSON.parse(l); }
        catch (e) {
          Console.error('Error parsing backup from ' + this.dbName + '/' + this.tableName, e);
          return undefined;
        }
      }).filter(l => !!l);
      if (json.length === 0) return Promise.resolve();
      let restore$: Promise<any> = Promise.resolve();
      if (!versionLineRead) {
        const version = json.splice(0, 1)[0];
        if (!(version['version'])) throw new Error('Invalid first line, expected a version, found: ' + JSON.stringify(version));
        restore$ = v.add(version);
      }
      if (json.length > 0)
        restore$ = restore$.then(() => t.bulkAdd(json));
      return restore$;
    })
    .then(() => Console.info('DB restored from ' + this.dbName + '/' + this.tableName))
    .catch(e => {
      Console.error('Error restoring backup from ' + this.dbName + '/' + this.tableName, e);
      return undefined;
    });
  }

  private migrateToLocalFiles(db: Dexie): Promise<any> {
    const dbName = this.dbName;
    const tableName = this.tableName;
    const dir = this.dir!;
    Console.info('Migrating DB ' + this.dbName + ' to local files');
    const t = db.table(this.tableName);
    return t.toCollection().primaryKeys()
    .then(keys => {
      if (keys.length === 0) return undefined;
      Console.info(keys.length + ' entries to migrate to local files from ' + dbName + '/' + tableName);
      const progress = this.injector.get(ProgressService).create(this.injector.get(I18nService).texts.update.updating, keys.length);
      const next = (from: number): Promise<any> => {
        const end = Math.min(keys.length, from + 25);
        const keysToProcess = keys.slice(from, end);
        return t.bulkGet(keysToProcess)
        .then(dtos => Promise.all(
          dtos.map(dto => {
            const blob = dto[this.dtoBlobField];
            if (!blob) {
              progress.addWorkDone(1);
              return Promise.resolve(dto);
            }
            return this.localService.saveBinaryFile(dir + '/' + tableName, dto[this.dtoKeyField], new BinaryContent(blob))
            .then(() => progress.addWorkDone(1))
            .then(() => {
              delete dto[this.dtoBlobField];
              return dto;
            });
          })
        ))
        .then(dtos => t.bulkPut(dtos))
        .then(() => {
          if (end === keys.length) {
            progress.done();
            return undefined;
          }
          return next(from + 25);
        });
      };
      return next(0);
    })
    .then(() => Console.info('DB migrated to local files: ' + dbName + '/' + tableName));
  }

  private onReady(): Observable<Table> {
    const email = this.openEmail;
    return this.ready$.pipe(filter(r => r && email === this.openEmail), map(() => this.table!));
  }

  public getBlobByKey(key: string, contentType?: string): Observable<Blob> {
    if (this.localService.supported()) return from(this.localService.readBlob(this.dir! + '/' + this.tableName, key, contentType));
    return this.onReady().pipe(
      switchMap(table => from(table.where(this.dtoKeyField).equals(key).first().then(entry => entry?.[this.dtoBlobField]))),
      filterDefined(),
      throwIfEmpty(() => new Error('File ' + key + ' not found'))
    );
  }

  public blobExists(key: string): Observable<boolean> {
    if (this.localService.supported()) return from(this.localService.fileExists(this.dir! + '/' + this.tableName, key));
    return this.onReady().pipe(
      switchMap(table => from(table.where(this.dtoKeyField).equals(key).primaryKeys().then(pks => pks.length > 0))),
    );
  }

  public storeBlob(dto: any): Observable<any> {
    return this.onReady().pipe(
      switchMap(table => {
        if (this.localService.supported()) {
          const blob = dto[this.dtoBlobField];
          delete dto[this.dtoBlobField];
          return from(
            this.localService.saveBinaryFile(this.dir! + '/' + this.tableName, dto[this.dtoKeyField], new BinaryContent(blob))
            .then(() => table.add(dto, dto[this.dtoKeyField]))
            .then(() => this.dbChanged$.emit(true))
          );
        }
        return from(table.add(dto, dto[this.dtoKeyField]).then(() => this.dbChanged$.emit(true)));
      })
    );
  }

  public deleteEntry(key: string): Observable<any> {
    return this.onReady().pipe(
      switchMap(table => from(
        (this.localService.supported() ? this.localService.deleteFile(this.dir! + '/' + this.tableName, key) : Promise.resolve())
        .then(() => table.delete(key))
        .then(() => this.dbChanged$.emit(true))
      ))
    );
  }

  public deleteEntries(keys: string[]): Observable<any> {
    if (keys.length === 0) return of(undefined);
    return this.onReady().pipe(
      switchMap(table => from(
        (this.localService.supported() ? this.localService.deleteFiles(this.dir! + '/' + this.tableName, keys) : Promise.resolve())
        .then(() => table.bulkDelete(keys))
        .then(() => this.dbChanged$.emit(true))
      ))
    );
  }

  public listContentWithSize(chunk: number, keyPredicate?: (key: string) => boolean, dtoPredicate?: (dto: any) => boolean): Observable<{dto: any, size: number}[]> {
    return this.onReady().pipe(switchMap(table => new Observable<{dto: any, size: number}[]>(subscriber => {
      if (this.table !== table) {
        subscriber.complete();
        return;
      }
      let keys$ = table.toCollection().primaryKeys();
      if (keyPredicate) keys$ = keys$.then(k => k.filter(keyPredicate));
      keys$.then(keys => {
        if (keys.length === 0 || table !== this.table) {
          subscriber.complete();
          return;
        }
        const next = (i:number) => {
          if (table !== this.table) {
            subscriber.complete();
            return;
          }
          const end = Math.min(i + chunk, keys.length);
          const bunch = keys.slice(i, end);
          let nexts$: Promise<{dto: any, size: number}[]>;
          if (this.localService.supported()) {
            const mapWithSizes = (dtos: any[], sizes: {filename: string, size: number}[]) =>
              dtos.map(dto => {
                if (!dto) return undefined;
                const size = sizes.find(s => s.filename === dto[this.dtoKeyField])?.size ?? 0;
                return {dto, size};
              }).filter(dto => !!dto);
            if (dtoPredicate) {
              nexts$ = table.bulkGet(bunch).then(dtos => {
                const filtered = table === this.table ? dtos.filter(dto => !!dto && dtoPredicate(dto)) : [];
                if (filtered.length === 0) return [];
                return this.localService.filesSize(this.dir! + '/' + this.tableName, filtered).then(sizes => mapWithSizes(filtered, sizes));
              });
            } else {
              nexts$ = Promise.all([
                table.bulkGet(bunch),
                this.localService.filesSize(this.dir! + '/' + this.tableName, bunch)
              ]).then(([dtos, sizes]) => mapWithSizes(dtos, sizes));
            }
          } else {
            nexts$ = table.bulkGet(bunch).then(dtos => {
              dtos = dtos.filter(dto => !!dto && (dtoPredicate ? dtoPredicate(dto) : true));
              return dtos.map(dto => ({dto, size: (dto[this.dtoBlobField] as Blob | undefined)?.size ?? 0}));
            });
          }
          nexts$.then(n => {
            if (table !== this.table) {
              subscriber.complete();
              return;
            }
            subscriber.next(n);
            if (end < keys.length) next(end);
            else subscriber.complete();
          })
        }
        next(0);
      });
    })));
  }

  public deleteWhen(chunk: number, keyPredicate?: (key: string) => boolean, dtoPredicate?: (dto: any) => boolean): Observable<any> {
    return this.onReady().pipe(
      switchMap(table => {
        let count = 0;
        const dbName = this.dbName;
        const tableName = this.tableName;
        let keys$ = table.toCollection().primaryKeys();
        if (keyPredicate) keys$ = keys$.then(k => k.filter(keyPredicate));
        return from(keys$.then(keys => {
          if (keys.length === 0 || table !== this.table) return undefined;
          const next = (i:number): Promise<any> => {
            if (table !== this.table) return Promise.resolve(undefined);
            const end = Math.min(i + chunk, keys.length);
            const bunch = keys.slice(i, end);
            const dtos$ = table.bulkGet(bunch).then(dtos => dtos.filter(dto => !!dto && (dtoPredicate ? dtoPredicate(dto) : true)));
            const nextKeys$ = dtos$.then(dtos => dtos.map(dto => dto[this.dtoKeyField] as string));
            return nextKeys$.then(toRemove => {
              if (table !== this.table) return undefined;
              return table.bulkDelete(toRemove)
              .then(() => this.localService.supported() && table === this.table ? this.localService.deleteFiles(this.dir! + '/' + this.tableName, toRemove) : undefined)
              .then(() => count += toRemove.length);
            }).then(() => {
              if (table === this.table && end < keys.length) return next(end);
              return undefined;
            })
          };
          return next(0)
          .then(() => {
            this.dbChanged$.emit(true);
            Console.info('Files deleted from ' + dbName + '/' + tableName + ': ' + count);
          });
        }));
      })
    );
  }

}
