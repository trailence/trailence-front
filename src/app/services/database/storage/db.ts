import { Injector, NgZone } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import Dexie from 'dexie';
import { BehaviorSubject, EMPTY, filter, from, map, Observable, of, Subject, Subscription, switchMap, tap } from 'rxjs';
import { Console } from 'src/app/utils/console';
import { DbTable } from './db-table';
import { LocalFilesService } from '../../local-files/local-files.service';
import { trailenceAppVersionCode } from 'src/app/trailence-version';
import { DbRegistryService } from './db.registry.service';

const INTERNAL_TABLE_NAME = 'internal';
const INTERNAL_KEY = 'key';
const INTERNAL_VERSION_KEY = 'version';

export interface DbReady {
  db: Dexie;
  counter: number;
  email: string | undefined;
  isNew: boolean;
  localDir: string;
  updatedFrom: number | undefined;
}

export interface DbClosed {
  email: string | undefined;
}

export class Db {

  constructor(
    protected readonly injector: Injector,
    protected readonly dbName: string,
    protected readonly dbByUser: boolean,
    protected readonly tables: DbTable<any>[],
  ) {}

  private readonly ready$ = new BehaviorSubject<DbReady | undefined>(undefined);
  private readonly tableChangedSubscriptions = new Map<string, Subscription>();
  private closing: Promise<any> | undefined = undefined;
  private opening: Promise<any> | undefined = undefined;
  private readonly _closed$ = new Subject<DbClosed>();
  private _openCounter = 0;
  private readonly hooksBeforeCreatingDb: ((email: string | undefined) => Promise<boolean>)[] = [];
  private _started = false;

  addHookBeforeCreatingDb(hook: (email: string | undefined) => Promise<boolean>): void {
    this.hooksBeforeCreatingDb.push(hook);
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    this.injector.get(DbRegistryService).register(this.dbName, {
      isByUser: this.dbByUser,
      close$: () => this.close(),
    });
    if (this.dbByUser) {
      this.injector.get(NgZone).runOutsideAngular(() =>
        this.injector.get(AuthService).userChanged$.subscribe(
          auth => {
            if (auth) this.open(auth.email);
            else this.close();
          }
        )
      );
    } else {
      this.open();
    }
  }

  stop(): Promise<any> {
    return this.close();
  }

  public get dbReady$(): Observable<DbReady | undefined> { return this.ready$; }
  public get dbClosed$() {
    if (this.closing) return from(this.closing).pipe(map(() => true));
    if (this.ready$.value) return of(false);
    return of(true);
  }
  public get onClosed$(): Observable<DbClosed> { return this._closed$; }

  public tableLocalDir$(tableName: string): Observable<string> {
    return this.ready$.pipe(
      filter(status => !!status),
      map(status => status.localDir + '/' + tableName),
    )
  }

  public transaction$<T>(readonly: boolean, tables: string[], op: () => Promise<T> | undefined): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.ready$.value!.db.transaction(readonly ? 'r' : 'rw', tables, () => ({result: op()}))
      .then(r => r.result ? r.result.then(resolve).catch(reject) : undefined);
    });
  }

  private async open(email?: string): Promise<any> {
    if (this.ready$.value && this.ready$.value.email === email) return;
    await this.close();
    if (email && this.injector.get(AuthService).email !== email) return;
    if (this.opening) {
      const previous = this.opening;
      this.opening = previous.then(() => this.open(email));
      return this.opening;
    }
    if (email && this.injector.get(AuthService).email !== email) return;
    const counter = ++this._openCounter;
    this.opening = new Promise((resolve, reject) => {
      this._open(email, counter)
      .catch(reject)
      .then(() => {
        this.opening = undefined;
        resolve(true);
      });
    });
    await this.opening;
  }

  private async _open(email: string | undefined, counter: number) {
    const dbName = this.dbName + (email ? '_' + email : '');
    const start = Date.now();
    Console.info('[DB] Opening ' + dbName);
    const stillValid = () => this._openCounter === counter && (!email || email === this.injector.get(AuthService).email);

    let dbExists = await Dexie.exists(dbName);
    if (!stillValid()) return;

    if (!dbExists) {
      for (const hook of this.hooksBeforeCreatingDb) {
        dbExists = await hook(email).catch(e => {
          Console.error('Error in DB hook before creation', e);
          return false;
        });
        if (dbExists) break;
      }
    }

    const db = new Dexie(dbName);
    const openStatus: DbReady = {
      db,
      counter,
      email,
      isNew: !dbExists,
      localDir: (email ? email + '/' : '') + this.dbName,
      updatedFrom: undefined,
    };
    const schema: any = {};
    for (const table of this.tables) schema[table.name] = table.schema;
    schema[INTERNAL_TABLE_NAME] = INTERNAL_KEY;
    db.version(1).stores(schema);
    Console.info('[DB] ' + dbName + ' opened after ' + (Date.now() - start));

    // restore backups
    if (!dbExists) {
      try {
        dbExists = await this.restoreBackups(db, openStatus.localDir, stillValid);
      } catch (e) {
        Console.error('Error restoring backups for DB ' + dbName, e);
      }
      if (!stillValid()) return;
    }

    // migrations
    const versions = await db.table(INTERNAL_TABLE_NAME).get(INTERNAL_VERSION_KEY);
    if (!stillValid()) return;
    const initialVersion = dbExists ? 1100 : trailenceAppVersionCode;
    const appVersion: number | undefined = versions?.appVersion;
    Console.info('[DB] Database ' + this.dbName + ': current version is ' + trailenceAppVersionCode + ', stored =', versions, 'start time', Date.now() - start);
    if (dbExists && appVersion && appVersion < trailenceAppVersionCode) openStatus.updatedFrom = appVersion;
    const newVersions: any = versions ? { ...versions } : {};
    newVersions[INTERNAL_KEY] = INTERNAL_VERSION_KEY;
    for (const table of this.tables) {
      try {
        if (!stillValid()) return;
        const currentVersion = versions?.[table.name] || initialVersion;
        const newVersion = await table.migrate(db, db.table(table.name), openStatus.localDir + '/' + table.name, appVersion || initialVersion, dbExists, currentVersion, trailenceAppVersionCode);
        newVersions[table.name] = newVersion;
        if (newVersion !== currentVersion) {
          await db.table(INTERNAL_TABLE_NAME).put(newVersions, INTERNAL_VERSION_KEY);
        }
      } catch (e) {
        Console.error('Error during migration of table ' + this.dbName + '/' + table.name, e);
      }
    }
    if (!stillValid()) return;
    if (!appVersion || appVersion !== trailenceAppVersionCode) {
      newVersions['appVersion'] = trailenceAppVersionCode;
      await db.table(INTERNAL_TABLE_NAME).put(newVersions, INTERNAL_VERSION_KEY);
      if (!stillValid()) return;
    }

    // ready
    Console.info('[DB]', dbName, 'ready after', Date.now() - start);
    this.ready$.next(openStatus);
    for (const table of this.tables) {
      await table.start(this, openStatus, db.table(table.name), openStatus.localDir + '/' + table.name, stillValid);
      if (!stillValid()) return;
    }
    Console.info('[DB]', dbName, 'ready and all tables started after', Date.now() - start);

    // backups
    this.registerBackups(openStatus);
  }

  private close(): Promise<any> {
    if (this.closing) return this.closing.then(() => this.close());
    this.closing = this._close().then(() => {
      this.closing = undefined;
    });
    return this.closing;
  }

  private async _close(): Promise<any> {
    const ready = this.ready$.value;
    if (!ready) return;
    Console.info('[DB] Closing', ready.db.name);
    this._openCounter++;
    this.ready$.next(undefined);
    for (const s of this.tableChangedSubscriptions.values()) s.unsubscribe();
    this.tableChangedSubscriptions.clear();
    for (const table of this.tables)
      await table.shutdown();
    ready.db.close();
    Console.info('[DB] Closed', ready.db.name);
    this._closed$.next({email: ready.email});
  }

  private async restoreBackups(db: Dexie, localDir: string, stillValid: () => boolean): Promise<boolean> {
    const localFiles = this.injector.get(LocalFilesService);
    if (!localFiles.supported()) return false;
    if (!(await localFiles.fileExists(localDir, INTERNAL_TABLE_NAME + '.jsonl'))) return false;
    if (!stillValid()) return false;
    const backupableTables = this.tables.filter(t => t.backupEnabled).map(t => t.name);
    const backupExist = await localFiles.filesExist(localDir, backupableTables.map(name => name + '.jsonl'));
    if (!stillValid()) return false;
    await this.restoreTable(db, INTERNAL_TABLE_NAME, localFiles, localDir);
    for (let i = 0; i < backupableTables.length; ++i) {
      if (backupExist[i]) {
        const tableName = backupableTables[i];
        try {
          if (!stillValid()) return false;
          await this.restoreTable(db, tableName, localFiles, localDir);
        } catch (e) {
          Console.error('Error restoring backup from ' + this.dbName + '/' + tableName, e);
        }
      }
    }
    return true;
  }

  private async restoreTable(db: Dexie, tableName: string, localFiles: LocalFilesService, localDir: string) {
    Console.info('Restoring table ' + tableName + ' for DB ' + this.dbName);
    const table = db.table(tableName);
    await localFiles.readJsonl(localDir, tableName + '.jsonl', async (lines: string[]) => {
      const json = lines
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .map(l => {
          try { return JSON.parse(l); }
          catch (e) {
            Console.error('Error parsing backup from ' + this.dbName + '/' + tableName + ': line = ', l, 'error', e);
            return undefined;
          }
        })
        .filter(l => !!l)
        ;
      if (json.length === 0) {
        Console.info('Table ' + tableName + ' in DB ' + this.dbName + ' successfully restored.');
        return;
      }
      await table.bulkAdd(json);
    });
  }

  private registerBackups(ready: DbReady): void {
    const localFiles = this.injector.get(LocalFilesService);
    if (!localFiles.supported()) return;
    for (const table of this.tables) this.registerBackup(localFiles, table, ready);
    // launch backup of internal table
    if (this.ready$.value === ready)
      this.backupTable(ready, localFiles, INTERNAL_TABLE_NAME, 1000, false);
  }

  private registerBackup(localFiles: LocalFilesService, table: DbTable<any>, ready: DbReady): void {
    if (!table.backupEnabled) return;
    this.injector.get(NgZone).runOutsideAngular(() => {
      let pending = false;
      this.tableChangedSubscriptions.set(table.name, table.changed$.pipe(
        table.triggerBackupOperator,
        switchMap(latestChange => {
          if (this.ready$.value !== ready) return EMPTY;
          if (pending) {
            table.triggerChanged('replay due to pending backup: ' + latestChange);
            return of(undefined);
          } else {
            Console.info('Start backuping table ' + table.name + ', trigger = ' + latestChange);
            pending = true;
            return from(this.backupTable(ready, localFiles, table.name, table.backupLinesBunch, false)).pipe(tap(() => pending = false));
          }
        })
      ).subscribe());
    });
    if (this.ready$.value === ready)
      table.addShutdownHook(() => this.backupTable(ready, localFiles, table.name, table.backupLinesBunch, true));
  }

  private async backupTable(ready: DbReady, localFiles: LocalFilesService, tableName: string, chunkSize: number, onClose: boolean) {
    if (!onClose && this.ready$.value !== ready) return;
    Console.info('Backuping DB table ' + ready.db.name + '/' + tableName);
    const start = Date.now();
    const t = ready.db.table(tableName);
    const filename = tableName + '.jsonl';
    try {
      const keys = await t.toCollection().primaryKeys();
      if (!onClose && this.ready$.value !== ready) return;
      await localFiles.saveJsonl(
        ready.localDir,
        filename,
        async (from, limit) => {
          const end = Math.min(keys.length, from + limit);
          const hasMore = end < keys.length;
          const dtos = await t.bulkGet(keys.slice(from, end));
          const lines = dtos.map(dto => JSON.stringify(dto));
          return {lines, hasMore};
        },
        chunkSize,
      );
      Console.info('Backup done for DB table to', ready.localDir + '/' + filename, 'in', (Date.now() - start), 'ms.');
    } catch (e) {
      Console.error('Error storing backup to ' + ready.localDir + '/' + filename, e);
      this.injector.get(LocalFilesService).deleteFile(ready.localDir, filename);
    }
  }

  public static setInternalData(db: Dexie, key: string, data: any) {
    return db.table(INTERNAL_TABLE_NAME).put({key, data});
  }

  public static readInternalData(db: Dexie, key: string) {
    return db.table(INTERNAL_TABLE_NAME).get(key);
  }

  public async setInternalData(key: string, data: any) {
    const db = this.ready$.value?.db;
    if (db) return await Db.setInternalData(db, key, data);
    return undefined;
  }

  public async readInternalData(key: string) {
    const db = this.ready$.value?.db;
    if (db) return await Db.readInternalData(db, key);
    return undefined;
  }

}
