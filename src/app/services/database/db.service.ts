import { Injectable, Injector } from '@angular/core';
import { Db, DbSchema } from './db.interface';
import { DB_IMPLEMENTATIONS, DbImplementation, DbImplementationFactory } from './impl/implementations';

interface ImplentationCache {
  factory: DbImplementationFactory;
  impl: DbImplementation;
  schemas: string[];
  exhaustiveSchemas: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class DbService {

  private _cache: ImplentationCache[] = [];

  constructor(
    private readonly injector: Injector,
  ) {}

  public async open(persistent: boolean, schema: DbSchema): Promise<Db> {
    const implementations = [...DB_IMPLEMENTATIONS].sort((i1, i2) => {
      if (i1.isPersistent === persistent) {
        if (i2.isPersistent === persistent) {
          return i2.priority - i1.priority;
        }
        return -1;
      }
      if (i2.isPersistent === persistent) {
        return 1;
      }
      return i2.priority - i1.priority;
    });
    const factory = implementations[0];
    const cache = await this.getCache(factory);
    cache.schemas.push(schema.name);
    return await cache.impl.openDatabase(schema);
  }

  private async getCache(factory: DbImplementationFactory): Promise<ImplentationCache> {
    const cache = this._cache.find(c => c.factory === factory);
    if (cache) return cache;
    const newCache = {factory, impl: await factory.get(this.injector), schemas: [], exhaustiveSchemas: false};
    this._cache.push(newCache);
    return newCache;
  }

  public async listNames(): Promise<string[]> {
    const names: string[] = [];
    for (const implementation of DB_IMPLEMENTATIONS) {
      const cache = await this.getCache(implementation);
      if (!cache.exhaustiveSchemas) {
        cache.schemas = await cache.impl.listDatabaseNames();
        cache.exhaustiveSchemas = true;
      }
      names.push(...cache.schemas);
    }
    return names;
  }

  public async deleteDatabase(schemaName: string): Promise<void> {
    for (const cache of this._cache) {
      let index = cache.schemas.indexOf(schemaName);
      if (index < 0 && !cache.exhaustiveSchemas) {
        cache.schemas = await cache.impl.listDatabaseNames();
        cache.exhaustiveSchemas = true;
        index = cache.schemas.indexOf(schemaName);
      }
      if (index >= 0) {
        cache.schemas.splice(index, 1);
        return await cache.impl.deleteDatabase(schemaName);
      }
    }
  }

}
