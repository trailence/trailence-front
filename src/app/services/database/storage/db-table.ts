import { EventEmitter, Injector, NgZone } from '@angular/core';
import Dexie, { Collection, Table } from 'dexie';
import { BehaviorSubject, debounceTime, first, firstValueFrom, from, map, MonoTypeOperatorFunction, Observable, of, switchMap } from 'rxjs';
import { Console } from 'src/app/utils/console';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { Db, DbReady } from './db';

export interface DbStatus<DTO> {
  counter: number;
  db: Db;
  table: Table<DTO, string>
  localDir: string;
  isNewDb: boolean;
  email: string | undefined;
}

export class DbTable<DTO> {

  constructor(
    protected readonly injector: Injector,
    public readonly name: string,
    public readonly schema: string,
    protected readonly dtoKeyField: string,
  ) {
    this.ngZone = injector.get(NgZone);
  }

  protected _changed$ = new EventEmitter<boolean>();

  public get changed$() { return this._changed$; }
  public triggerChanged(): void { this._changed$.emit(true); }

  public backupEnabled = true;

  private readonly migrations: DbTableMigration[] = [];

  public addMigration(migration: DbTableMigration): this {
    this.migrations.push(migration);
    return this;
  }

  public disableBackup(): this {
    this.backupEnabled = false;
    return this;
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

  private readonly shutdownHooks: (() => Promise<any>)[] = [];
  protected ready$ = new BehaviorSubject<DbStatus<DTO> | undefined>(undefined);
  private readonly ngZone: NgZone;

  async start(db: Db, ready: DbReady, table: Table, localDir: string, stillValid: () => boolean) {
    this.ready$.next({db, table, localDir, email: ready.email, isNewDb: ready.isNew, counter: ready.counter});
  }

  async shutdown() {
    this.ready$.next(undefined);
    for (const hook of this.shutdownHooks) {
      await hook();
    }
    this.shutdownHooks.splice(0, this.shutdownHooks.length);
  }

  public addShutdownHook(hook: () => Promise<any>): void {
    this.shutdownHooks.push(hook);
  }

  public onceReady$(): Observable<DbStatus<DTO>> {
    return this.ngZone.runOutsideAngular(() => this.ready$.pipe(filterDefined(), first()));
  }

  public onStatus$(): Observable<DbStatus<DTO> | undefined> {
    return this.ready$;
  }

  public whenReady$(): Observable<DbStatus<DTO>> {
    return this.ngZone.runOutsideAngular(() => this.ready$.pipe(filterDefined()));
  }

  protected isStillValid(status: DbStatus<DTO>): boolean {
    return this.ready$.value?.counter === status.counter;
  }

  public inTransaction$<T>(readonly: boolean, op: (stillValid: () => boolean) => Observable<T>): Observable<T> {
    return this.onceReady$().pipe(
      switchMap(status => {
        return status.db.transaction$(readonly, [status.table.name], () => {
          if (!this.isStillValid(status)) return undefined;
          return firstValueFrom(op(() => this.isStillValid(status)));
        });
      }),
    );
  }

  public dbNow(): Db | undefined {
    return this.ready$.value?.db;
  }

  protected toDtos: (fromTable: Partial<DTO>[], status: DbStatus<DTO>) => Promise<DTO[]> = dtos => Promise.resolve(dtos as DTO[]);
  protected fromDtos: (dtos: DTO[], status: DbStatus<DTO>) => Promise<Partial<DTO>[]> = dtos => Promise.resolve(dtos);
  protected deleted: (keys: string[], status: DbStatus<DTO>) => Promise<any> = () => Promise.resolve();

  public getAllKeys$(): Observable<string[]> {
    return this.onceReady$().pipe(
      switchMap(status => from(status.table.toCollection().primaryKeys())),
    );
  }

  public keysWhere$(where: DbTableWhere<DTO>, limit?: number, offset?: number): Observable<string[]> {
    return this.onceReady$().pipe(
      switchMap(status => {
        let collection = where.toDexie(status.table);
        if (offset !== undefined) collection = collection.offset(offset);
        if (limit !== undefined) collection = collection.limit(limit);
        return collection.primaryKeys();
      }),
    );
  }

  public getAll$(): Observable<DTO[]> {
    return this.onceReady$().pipe(
      switchMap(status => status.table.toArray().then(dtos => this.toDtos(dtos, status))),
    );
  }

  public forEach$(op: (dto: DTO) => void): Observable<any> {
    return this.onceReady$().pipe(
      switchMap(status => status.table.each(op))
    );
  }

  public getPage$(offset: number, limit: number): Observable<DTO[]> {
    return this.onceReady$().pipe(
      switchMap(status => status.table.offset(offset).limit(limit).toArray().then(dtos => this.toDtos(dtos, status))),
    );
  }

  public getWhere$(where: DbTableWhere<DTO>, limit?: number, offset?: number): Observable<DTO[]> {
    return this.onceReady$().pipe(
      switchMap(status => {
        let collection = where.toDexie(status.table);
        if (offset !== undefined) collection = collection.offset(offset);
        if (limit !== undefined) collection = collection.limit(limit);
        return collection.toArray();
      }),
    );
  }

  public getWhereMapping$<T>(where: DbTableWhere<DTO>, mapper: (dto: DTO) => T, limit?: number, offset?: number): Observable<T[]> {
    return this.onceReady$().pipe(
      switchMap(status => {
        let collection = where.toDexie(status.table);
        if (offset !== undefined) collection = collection.offset(offset);
        if (limit !== undefined) collection = collection.limit(limit);
        const result: T[] = [];
        return new Promise<T[]>((resolve, reject) => {
          collection.each(dto => result.push(mapper(dto)))
          .then(() => resolve(result)).catch(reject);
        });
      }),
    );
  }

  public count$(): Observable<number> {
    return this.onceReady$().pipe(
      switchMap(status => status.table.count()),
    );
  }

  public getByKey$(key: string): Observable<DTO | undefined> {
    return this.onceReady$().pipe(
      switchMap(status => status.table.get(key).then(dto => dto ? this.toDtos([dto], status).then(dtos => dtos[0]) : undefined)),
    );
  }

  public getOneWhen(predicate: (dto: DTO) => boolean): Observable<DTO | undefined> {
    return this.onceReady$().pipe(
      switchMap(status => status.table.filter(predicate).first().then(dto => dto ? this.toDtos([dto], status).then(dtos => dtos[0]) : undefined)),
    );
  }

  public getByKeys$(keys: string[]): Observable<DTO[]> {
    return this.onceReady$().pipe(
      switchMap(status => status.table.where(this.dtoKeyField).anyOf(keys).toArray().then(dtos => this.toDtos(dtos, status))),
    );
  }

  public exists$(key: string): Observable<boolean> {
    return this.onceReady$().pipe(
      switchMap(status => status.table.where(this.dtoKeyField).equals(key).primaryKeys().then(pks => pks.length > 0)),
    );
  }

  public exist(keys: string[]): Observable<string[]> {
    return this.onceReady$().pipe(
      switchMap(status => status.table.where(this.dtoKeyField).anyOf(keys).primaryKeys())
    );
  }

  public addOne$(dto: DTO): Observable<DTO> {
    return this.onceReady$().pipe(
      switchMap(async status => {
        const toStore = await this.fromDtos([dto], status).then(dtos => dtos[0]);
        await status.table.add(toStore as DTO, (dto as any)[this.dtoKeyField]);
        this.triggerChanged();
        return dto;
      })
    );
  }

  public addMany$(dtos: DTO[]): Observable<DTO[]> {
    return this.onceReady$().pipe(
      switchMap(async status => {
        const toStore = await this.fromDtos(dtos, status);
        await status.table.bulkAdd(toStore as DTO[]);
        this.triggerChanged();
        return dtos;
      })
    );
  }

  public setOne$(dto: DTO): Observable<DTO> {
    return this.onceReady$().pipe(
      switchMap(async status => {
        const toStore = await this.fromDtos([dto], status).then(dtos => dtos[0]);
        await status.table.put(toStore as DTO, (dto as any)[this.dtoKeyField]);
        this.triggerChanged();
        return dto;
      })
    );
  }

  public setMany$(dtos: DTO[]): Observable<DTO[]> {
    return this.onceReady$().pipe(
      switchMap(async status => {
        const toStore = await this.fromDtos(dtos, status);
        await status.table.bulkPut(toStore as DTO[]);
        this.triggerChanged();
        return dtos;
      })
    );
  }

  public deleteOne$(key: string): Observable<boolean> {
    return this.onceReady$().pipe(
      switchMap(status => Promise.all([
        status.table.delete(key),
        this.deleted([key], status),
      ]).then(() => {
        this.triggerChanged();
        return true;
      }))
    );
  }

  public deleteMany$(keys: string[]): Observable<boolean> {
    if (keys.length === 0) return of(true);
    return this.onceReady$().pipe(
      switchMap(status => Promise.all([
        status.table.bulkDelete(keys),
        this.deleted(keys, status),
      ]).then(() => {
        this.triggerChanged();
        return true;
      }))
    );
  }

  public deleteWhen$(chunk: number, keyPredicate?: (key: string) => boolean, dtoPredicate?: (dto: Partial<DTO>) => boolean, filter$?: (items: Partial<DTO>[]) => Promise<Partial<DTO>[]>): Observable<number> {
    return this.onceReady$().pipe(
      switchMap(status => {
        let count = 0;
        let keys$ = status.table.toCollection().primaryKeys();
        if (keyPredicate) keys$ = keys$.then(k => k.filter(keyPredicate));
        return from(keys$.then(keys => {
          if (keys.length === 0 || !this.isStillValid(status)) return count;
          const next = (i:number): Promise<any> => {
            if (!this.isStillValid(status)) return Promise.resolve(count);
            const end = Math.min(i + chunk, keys.length);
            const bunch = keys.slice(i, end);
            const dtos$ = status.table.bulkGet(bunch)
              .then(dtos => dtos.filter(dto => !!dto && (dtoPredicate ? dtoPredicate(dto) : true)) as (Partial<DTO>[]))
              .then(dtos => filter$ ? filter$(dtos) : dtos);
            const nextKeys$ = dtos$.then(dtos => dtos.map(dto => (dto as any)[this.dtoKeyField] as string));
            return nextKeys$.then(toRemove => {
              if (!this.isStillValid(status)) return count;
              return status.table.bulkDelete(toRemove)
              .then(() => this.isStillValid(status) ? this.deleted(toRemove, status) : undefined)
              .then(() => count += toRemove.length);
            }).then(() => {
              if (this.isStillValid(status) && end < keys.length) return next(end);
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
    return this.onceReady$().pipe(
      switchMap(status => status.table.clear().then(() => true)),
    );
  }

  public deleteWhere$(where: DbTableWhere<DTO>): Observable<number> {
    return this.onceReady$().pipe(
      switchMap(status => {
        let collection = where.toDexie(status.table);
        return collection.delete();
      }),
    );
  }

  public replaceAll$(itemsProvider: () => DTO[]): Observable<boolean> {
    return this.onceReady$().pipe(
      switchMap(info => {
        const counter = info.counter;
        return info.db.transaction$(false, [info.table.name], async () => {
          if (counter !== this.ready$.value?.counter) return undefined;
          await info.table.clear();
          const items = itemsProvider();
          if (items.length > 0)
            await info.table.bulkAdd(items);
          return true;
        });
      }),
      map(r => !!r),
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

export class DbTableWhereEquals<T> implements DbTableWhere<T> {
  constructor(
    private readonly key: string,
    private readonly value: string | number,
    private readonly predicate?: (dto: T) => boolean,
  ) {}

  toDexie(table: Table<T, string>) {
    const collection = table.where(this.key).equals(this.value);
    if (this.predicate != null) return collection.and(this.predicate);
    return collection;
  }
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

export class DbTableWhereGreaterThan<T> implements DbTableWhere<T> {
  constructor(
    private readonly key: string,
    private readonly value: number,
    private readonly predicate?: (dto: T) => boolean,
  ) {}

  toDexie(table: Table<T, string>) {
    const collection = table.where(this.key).above(this.value);
    if (this.predicate != null) return collection.and(this.predicate);
    return collection;
  }
}
