import { Db, DbSchema, DbTable } from '../../db.interface';
import Dexie, { Table } from 'dexie';
import { DbImplementation } from '../implementations';

export class IndexedDbImpl implements DbImplementation {
  async openDatabase(schema: DbSchema): Promise<Db> {
    const db = new IndexedDb();
    await db.open(schema);
    return db;
  }

  listDatabaseNames(): Promise<string[]> {
    return Dexie.getDatabaseNames();
  }

  deleteDatabase(name: string): Promise<void> {
    return Dexie.delete(name);
  }
}

class IndexedDb implements Db {

  private _dexie!: Dexie;
  private _schema!: DbSchema;
  private _tables = new Map<string, DbTable<any, any>>();

  constructor(
  ) {
  }

  async open(schema: DbSchema) {
    this._schema = schema;
    this._dexie = new Dexie(schema.name);
    const stores: any = {};
    for (const table of schema.tables) {
      let definition = '';
      for (const index of table.indexes) {
        if (definition.length === 0) definition += ', ';
        definition += index.name;
      }
      stores[table.name] = definition;
    }
    this._dexie.version(1).stores(stores);
    for (const table of schema.tables) {
      this._tables.set(table.name, new DexieTable<any, any>(this._dexie.table(table.name)));
    }
  }

  async close() {
    this._dexie.close();
  }

  table<P, T>(name: string): DbTable<P, T> {
    const table = this._tables.get(name);
    if (!table) throw new Error('Unknown table: ' + name);
    return table as DbTable<P, T>;
  }

  async transaction<T>(readonly: boolean, tables: DbTable<any, any>[], op: () => Promise<T>): Promise<T> {
    return await this._dexie.transaction(readonly ? 'r' : 'rw', tables.map(t => t.name), op);
  }

  async delete() {
    await this._dexie.delete();
    this._dexie.close();
  }

}

class DexieTable<P, T> implements DbTable<P, T> {

  public readonly name: string;

  constructor(
    private readonly table: Table<T, P>,
  ) {
    this.name = table.name;
  }

  async get(pk: P) {
    return await this.table.get(pk);
  }

  async put(row: any) {
    await this.table.put(row);
  }

  async delete(pk: P) {
    await this.table.delete(pk);
  }
}
