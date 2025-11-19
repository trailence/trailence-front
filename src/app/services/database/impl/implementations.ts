import { Injector } from '@angular/core';
import { Db, DbSchema } from '../db.interface';

export interface DbImplementationFactory {
  priority: number;
  isPersistent: boolean;
  get: (injector: Injector) => Promise<DbImplementation>;
}

export interface DbImplementation {
  openDatabase(schema: DbSchema): Promise<Db>;
  listDatabaseNames(): Promise<string[]>;
  deleteDatabase(name: string): Promise<void>;
}

export const DB_IMPLEMENTATIONS: DbImplementationFactory[] = [
  {
    priority: 100,
    isPersistent: false,
    get: () => import('./indexeddb/indexed-db').then(module => new module.IndexedDbImpl()),
  },
];
