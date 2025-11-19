export interface Db {

  close(): Promise<void>;

  table<P, T>(name: string): DbTable<P, T>;

  transaction<R>(readonly: boolean, tables: DbTable<any, any>[], op: () => Promise<R>): Promise<R>;

  delete(): Promise<void>;

}

export interface DbSchema {
  name: string;
  tables: DbTableSchema[];
}

export interface DbTableSchema {
  name: string;
  indexes: DbTableIndex[],
}

export interface DbTableIndex {
  name: string;
  type: DbTableIndexType;
  constraints?: DbTableIndexConstraint[];
}

export type DbTableIndexType = 'string' | 'integer' | 'float';

export type DbTableIndexConstraint = 'primary';

export interface DbTable<P, T> {
  readonly name: string;

  get(pk: P): Promise<T | undefined>;
  put(row: any): Promise<void>;
  delete(pk: P): Promise<void>;

}
