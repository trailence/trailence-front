import { Injector } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import Dexie from 'dexie';
import { BehaviorSubject, from, of, Subscription, switchMap, tap } from 'rxjs';
import { Console } from 'src/app/utils/console';
import { DbTable } from './db-table';
import { LocalFilesService } from '../../local-files/local-files.service';
import { trailenceAppVersionCode } from 'src/app/trailence-version';

const INTERNAL_TABLE_NAME = 'internal';
const INTERNAL_KEY = 'key';
const INTERNAL_VERSION_KEY = 'version';

export class Db {

  constructor(
    protected readonly injector: Injector,
    protected readonly dbName: string,
    protected readonly dbByUser: boolean,
    protected readonly tables: DbTable<any>[],
  ) {}

  protected openEmail?: string;
  protected db?: Dexie;
  protected localDir?: string;
  protected readonly ready$ = new BehaviorSubject<boolean>(false);
  private readonly tableChangedSubscriptions = new Map<string, Subscription>();

  start(): void {
    if (this.dbByUser) {
      this.injector.get(AuthService).userChanged$.subscribe(
        auth => {
          if (auth) this.open(auth.email);
          else this.close();
        }
      );
    } else {
      this.open();
    }
  }

  private async open(email?: string) {
    if (this.openEmail === email) return;
    this.close();
    const dbName = this.dbName + (email ? '_' + email : '');
    Console.info('Opening DB ' + dbName);
    this.localDir = (email ? email + '/' : '') + this.dbName;
    this.openEmail = email;

    const dbExists = await Dexie.exists(dbName);
    if (this.openEmail !== email) return;

    const db = new Dexie(dbName);
    const schema: any = {};
    for (const table of this.tables) schema[table.name] = table.schema;
    schema[INTERNAL_TABLE_NAME] = INTERNAL_KEY;
    db.version(1).stores(schema);

    // restore backups
    if (!dbExists) {
      try {
        await this.restoreBackups(db, email);
      } catch (e) {
        Console.error('Error restoring backups for DB ' + dbName, e);
      }
      if (this.openEmail !== email) return;
    }

    // migrations
    const versions = await db.table(INTERNAL_TABLE_NAME).get(INTERNAL_VERSION_KEY);
    if (this.openEmail !== email) return;
    const initialVersion = dbExists ? 1100 : trailenceAppVersionCode;
    const appVersion: number | undefined = versions?.appVersion;
    Console.info('Database ' + this.dbName + ': current version is ' + trailenceAppVersionCode + ', stored =', versions);
    const newVersions: any = versions ? { ...versions } : {};
    newVersions[INTERNAL_KEY] = INTERNAL_VERSION_KEY;
    for (const table of this.tables) {
      try {
        if (this.openEmail !== email) return;
        const currentVersion = versions?.[table.name] || initialVersion;
        const newVersion = await table.migrate(db, db.table(table.name), this.localDir + '/' + table.name, appVersion || initialVersion, dbExists, currentVersion, trailenceAppVersionCode);
        newVersions[table.name] = newVersion;
        if (newVersion !== currentVersion) {
          await db.table(INTERNAL_TABLE_NAME).put(newVersions, INTERNAL_VERSION_KEY);
        }
      } catch (e) {
        Console.error('Error during migration of table ' + this.dbName + '/' + table.name, e);
      }
    }
    if (this.openEmail !== email) return;
    if (!appVersion || appVersion !== trailenceAppVersionCode) {
      newVersions['appVersion'] = trailenceAppVersionCode;
      await db.table(INTERNAL_TABLE_NAME).put(newVersions, INTERNAL_VERSION_KEY);
      if (this.openEmail !== email) return;
    }

    // ready
    this.db = db;
    for (const table of this.tables) {
      await table.start(db, db.table(table.name), this.localDir + '/' + table.name, email);
      if (this.openEmail !== email) return;
    }
    Console.info('DB ready ' + dbName);
    this.ready$.next(true);

    // backups
    this.registerBackups();

    for (const table of this.tables) table.triggerChanged();
  }

  private close(): void {
    if (!this.db) return;
    Console.info('Close DB ' + this.db.name);
    const db = this.db;
    this.openEmail = undefined;
    this.db = undefined;
    this.ready$.next(false);
    for (const s of this.tableChangedSubscriptions.values()) s.unsubscribe();
    this.tableChangedSubscriptions.clear();
    for (const table of this.tables) table.shutdown();
    db.close();
  }

  private async restoreBackups(db: Dexie, email: string | undefined) {
    const localFiles = this.injector.get(LocalFilesService);
    if (!localFiles.supported()) return;
    const dir = this.localDir!;
    if (!(await localFiles.fileExists(dir, INTERNAL_TABLE_NAME + '.jsonl'))) return;
    const backupExist = await localFiles.filesExist(dir, this.tables.map(t => t.name + '.jsonl'));
    if (this.openEmail !== email) return;
    await this.restoreTable(db, INTERNAL_TABLE_NAME, localFiles);
    for (let i = 0; i < this.tables.length; ++i) {
      if (backupExist[i])
        try {
          if (this.openEmail !== email) return;
          await this.restoreTable(db, this.tables[i].name, localFiles);
        } catch (e) {
          Console.error('Error restoring backup from ' + this.dbName + '/' + this.tables[i].name, e);
        }
    }
  }

  private async restoreTable(db: Dexie, tableName: string, localFiles: LocalFilesService) {
    Console.info('Restoring table ' + tableName + ' for DB ' + this.dbName);
    const table = db.table(tableName);
    await localFiles.readJsonl(this.localDir!, tableName + '.jsonl', async (lines: string[]) => {
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
      if (json.length === 0) return;
      await table.bulkAdd(json);
      Console.info('Table ' + tableName + ' in DB ' + this.dbName + ' successfully restored.');
    });
  }

  private registerBackups(): void {
    const localFiles = this.injector.get(LocalFilesService);
    if (!localFiles.supported()) return;
    for (const table of this.tables) this.registerBackup(localFiles, table);
  }

  private registerBackup(localFiles: LocalFilesService, table: DbTable<any>): void {
    let pending = false;
    this.tableChangedSubscriptions.set(table.name, table.changed$.pipe(
      table.triggerBackupOperator,
      switchMap(() => {
        if (pending) {
          table.triggerChanged();
          return of(undefined);
        } else {
          pending = true;
          return from(this.backupTable(table)).pipe(tap(() => pending = false));
        }
      })
    ).subscribe());
  }

  private async backupTable(table: DbTable<any>) {
    const db = this.db;
    if (!db) return;
    Console.info('Backuping DB table ' + db.name + '/' + table.name);
    const t = db.table(table.name);
    const dir = this.localDir!;
    const filename = table.name + '.jsonl';
    try {
      const keys = await t.toCollection().primaryKeys();
      await this.injector.get(LocalFilesService).saveJsonl(
        dir,
        filename,
        async (from, limit) => {
          const end = Math.min(keys.length, from + limit);
          const hasMore = end < keys.length;
          const dtos = await t.bulkGet(keys.slice(from, end));
          const lines = dtos.map(dto => JSON.stringify(dto));
          return {lines, hasMore};
        },
        table.backupLinesBunch,
      );
      Console.info('Backup done for DB table to ' + dir + '/' + filename);
    } catch (e) {
      Console.error('Error storing backup to ' + dir + '/' + filename, e);
      this.injector.get(LocalFilesService).deleteFile(dir, filename);
    }
  }

}
