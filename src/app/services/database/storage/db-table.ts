import { EventEmitter, Injector } from '@angular/core';
import Dexie, { Collection, Table } from 'dexie';
import { BehaviorSubject, debounceTime, filter, first, from, MonoTypeOperatorFunction, Observable, of, switchMap } from 'rxjs';
import { Console } from 'src/app/utils/console';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { Db } from './db';

export class DbTable<DTO> {

  constructor(
    protected readonly injector: Injector,
    public readonly name: string,
    public readonly schema: string,
    protected readonly dtoKeyField: string,
  ) {}

  protected _changed$ = new EventEmitter<boolean>();

  public get changed$() { return this._changed$; }
  public triggerChanged(): void { this._changed$.emit(true); }

  private readonly migrations: DbTableMigration[] = [];

  public addMigration(migration: DbTableMigration): void {
    this.migrations.push(migration);
  }

  public triggerBackupOperator: MonoTypeOperatorFunction<boolean> = debounceTime(5000);
  public backupLinesBunch = 1000;

  async migrate(dexie: Dexie, table: Table, localDir: string, previousAppVersion: number, dbAlreadyPresent: boolean, previousTableVersion: number, targetVersion: number): Promise<number> {
    this.migrations.sort((m1, m2) => m1.version - m2.version);
    let version = previousTableVersion;
    for (const migration of this.migrations) {
      if (version < migration.version) {
        Console.info('Migration of table ' + dexie.name + '/' + this.name + ': ' + migration.name + ' (to version ' + migration.version + ')');
        await migration.migration(this.injector, dexie, table, localDir);
        version = migration.version;
        Console.info('Migration done for table ' + dexie.name + '/' + this.name + ': ' + migration.name + ' (to version ' + migration.version + ')');
      }
    }
    return version;
  }

  private openEmail?: string;
  private readonly shutdownHooks: (() => Promise<any>)[] = [];
  protected localDir?: string;
  protected ready$ = new BehaviorSubject<Table<DTO, string> | undefined>(undefined);
  protected readyInfo$ = new BehaviorSubject<{db: Db} | undefined>(undefined);

  async start(db: Db, dexie: Dexie, table: Table, localDir: string, email: string | undefined) {
    this.openEmail = email;
    this.localDir = localDir;
    this.readyInfo$.next({db});
    this.ready$.next(table);
  }

  async shutdown() {
    this.openEmail = undefined;
    this.ready$.next(undefined);
    this.readyInfo$.next(undefined);
    for (const hook of this.shutdownHooks) {
      await hook();
    }
  }

  public addShutdownHook(hook: () => Promise<any>): void {
    this.shutdownHooks.push(hook);
  }

  public whenReady$(): Observable<{db: Db}> {
    return this.readyInfo$.pipe(
      filter(info => !!info)
    );
  }

  protected onReady(): Observable<Table<DTO, string>> {
    return this.ready$.pipe(filterDefined(), first());
  }

  protected isStillValid(table: Table): boolean {
    return this.ready$.value === table;
  }

  protected toDtos: (fromTable: Partial<DTO>[]) => Promise<DTO[]> = dtos => Promise.resolve(dtos as DTO[]);
  protected fromDtos: (dtos: DTO[]) => Promise<Partial<DTO>[]> = dtos => Promise.resolve(dtos);
  protected deleted: (keys: string[]) => Promise<any> = () => Promise.resolve();

  public getAllKeys$(): Observable<string[]> {
    return this.onReady().pipe(
      switchMap(table => from(table.toCollection().primaryKeys())),
    );
  }

  public keysWhere$(where: DbTableWhere<DTO>): Observable<string[]> {
    return this.onReady().pipe(
      switchMap(table => where.toDexie(table).primaryKeys()),
    );
  }

  public getAll$(): Observable<DTO[]> {
    return this.onReady().pipe(
      switchMap(table => table.toArray().then(dtos => this.toDtos(dtos))),
    );
  }

  public getPage$(offset: number, limit: number): Observable<DTO[]> {
    return this.onReady().pipe(
      switchMap(table => table.offset(offset).limit(limit).toArray().then(dtos => this.toDtos(dtos))),
    );
  }

  public count$(): Observable<number> {
    return this.onReady().pipe(
      switchMap(table => table.count()),
    );
  }

  public getByKey$(key: string): Observable<DTO | undefined> {
    return this.onReady().pipe(
      switchMap(table => table.get(key).then(dto => dto ? this.toDtos([dto]).then(dtos => dtos[0]) : undefined)),
    );
  }

  public getOneWhen(predicate: (dto: DTO) => boolean): Observable<DTO | undefined> {
    return this.onReady().pipe(
      switchMap(table => table.filter(predicate).first().then(dto => dto ? this.toDtos([dto]).then(dtos => dtos[0]) : undefined)),
    );
  }

  public getByKeys$(keys: string[]): Observable<DTO[]> {
    return this.onReady().pipe(
      switchMap(table => table.where(this.dtoKeyField).anyOf(keys).toArray().then(dtos => this.toDtos(dtos))),
    );
  }

  public exists$(key: string): Observable<boolean> {
    return this.onReady().pipe(
      switchMap(table => table.where(this.dtoKeyField).equals(key).primaryKeys().then(pks => pks.length > 0)),
    );
  }

  public addOne$(dto: DTO): Observable<DTO> {
    return this.onReady().pipe(
      switchMap(async table => {
        const toStore = await this.fromDtos([dto]).then(dtos => dtos[0]);
        await table.add(toStore as DTO, (dto as any)[this.dtoKeyField]);
        this.triggerChanged();
        return dto;
      })
    );
  }

  public addMany$(dtos: DTO[]): Observable<DTO[]> {
    return this.onReady().pipe(
      switchMap(async table => {
        const toStore = await this.fromDtos(dtos);
        await table.bulkAdd(toStore as DTO[]);
        this.triggerChanged();
        return dtos;
      })
    );
  }

  public setOne$(dto: DTO): Observable<DTO> {
    return this.onReady().pipe(
      switchMap(async table => {
        const toStore = await this.fromDtos([dto]).then(dtos => dtos[0]);
        await table.put(toStore as DTO, (dto as any)[this.dtoKeyField]);
        this.triggerChanged();
        return dto;
      })
    );
  }

  public setMany$(dtos: DTO[]): Observable<DTO[]> {
    return this.onReady().pipe(
      switchMap(async table => {
        const toStore = await this.fromDtos(dtos);
        await table.bulkPut(toStore as DTO[]);
        this.triggerChanged();
        return dtos;
      })
    );
  }

  public deleteOne$(key: string): Observable<boolean> {
    return this.onReady().pipe(
      switchMap(table => Promise.all([
        table.delete(key),
        this.deleted([key]),
      ]).then(() => {
        this.triggerChanged();
        return true;
      }))
    );
  }

  public deleteMany$(keys: string[]): Observable<boolean> {
    if (keys.length === 0) return of(true);
    return this.onReady().pipe(
      switchMap(table => Promise.all([
        table.bulkDelete(keys),
        this.deleted(keys),
      ]).then(() => {
        this.triggerChanged();
        return true;
      }))
    );
  }

  public deleteWhen$(chunk: number, keyPredicate?: (key: string) => boolean, dtoPredicate?: (dto: Partial<DTO>) => boolean): Observable<number> {
    return this.onReady().pipe(
      switchMap(table => {
        let count = 0;
        let keys$ = table.toCollection().primaryKeys();
        if (keyPredicate) keys$ = keys$.then(k => k.filter(keyPredicate));
        return from(keys$.then(keys => {
          if (keys.length === 0 || !this.isStillValid(table)) return count;
          const next = (i:number): Promise<any> => {
            if (!this.isStillValid(table)) return Promise.resolve(count);
            const end = Math.min(i + chunk, keys.length);
            const bunch = keys.slice(i, end);
            const dtos$ = table.bulkGet(bunch).then(dtos => dtos.filter(dto => !!dto && (dtoPredicate ? dtoPredicate(dto) : true)));
            const nextKeys$ = dtos$.then(dtos => dtos.map(dto => (dto as any)[this.dtoKeyField] as string));
            return nextKeys$.then(toRemove => {
              if (!this.isStillValid(table)) return count;
              return table.bulkDelete(toRemove)
              .then(() => this.isStillValid(table) ? this.deleted(toRemove) : undefined)
              .then(() => count += toRemove.length);
            }).then(() => {
              if (this.isStillValid(table) && end < keys.length) return next(end);
              return count;
            })
          };
          return next(0)
          .then(result => {
            this.triggerChanged();
            return result;
          });
        }));
      })
    );
  }

  public deleteAll$(): Observable<boolean> {
    return this.onReady().pipe(
      switchMap(table => table.clear().then(() => true)),
    );
  }

}

export interface DbTableMigration {
  name: string;
  version: number;
  migration: (injector: Injector, dexie: Dexie, table: Table, localDir: string) => Promise<any>;
}

export interface DbTableWhere<T> {
  toDexie: (table: Table<T, string>) => Collection<T, string>,
}

export class DbTableWhereLessThan<T> implements DbTableWhere<T> {
  constructor(
    private readonly key: string,
    private readonly value: number,
    private readonly predicate?: (dto: T) => boolean,
  ) {}

  toDexie(table: Table<T, string>) {
    const collection = table.where(this.key).below(this.value);
    if (this.predicate != null) return collection.and(this.predicate);
    return collection;
  }
}
