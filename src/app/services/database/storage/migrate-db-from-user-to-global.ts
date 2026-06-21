import Dexie from 'dexie';
import { AuthResponse } from '../../auth/auth-response';
import { LOCALSTORAGE_KEY_AUTH } from '../../auth/auth.service';
import { indexedDbCursorBatch, openIndexedDb } from '../indexed-db/indexed-db';
import { Injector } from '@angular/core';
import { LocalFilesService } from '../../local-files/local-files.service';
import { Console } from 'src/app/utils/console';

export async function migrateLatestUserDbToGlobalDb(dbName: string, injector: Injector): Promise<boolean> {
  const latestAuthStr = localStorage.getItem(LOCALSTORAGE_KEY_AUTH);
  if (!latestAuthStr) return false;
  let latestEmail: string;
  try {
    const latestAuth = JSON.parse(latestAuthStr) as AuthResponse;
    latestEmail = latestAuth.email;
  } catch (e) { // NOSONAR
    return false;
  }
  if (!latestEmail) return false;
  if (!(await Dexie.exists(dbName + '_' + latestEmail))) return false;

  // copy DB
  Console.info('[DB MIGRATION] copying from ' + dbName + '_' + latestEmail + ' to ' + dbName);
  const previousDb = await openIndexedDb(dbName + '_' + latestEmail);
  const tableNames: string[] = [];
  for (let tableIndex = 0; tableIndex < previousDb.objectStoreNames.length; tableIndex++) {
    const tableName = previousDb.objectStoreNames.item(tableIndex)!;
    tableNames.push(tableName);
  }
  const newDb = await openIndexedDb(dbName, 1, (db) => {
    const fromTransaction = previousDb.transaction(tableNames, 'readonly');
    for (const tableName of tableNames) {
      Console.info('[DB MIGRATION] Creating table ' + dbName + '/' + tableName);
      const fromTable = fromTransaction.objectStore(tableName);
      const newTable = db.createObjectStore(tableName, { keyPath: fromTable.keyPath, autoIncrement: fromTable.autoIncrement });
      for (let indexIndex = 0; indexIndex < fromTable.indexNames.length; ++indexIndex) {
        const indexName = fromTable.indexNames.item(indexIndex)!;
        const fromIndex = fromTable.index(indexName);
        newTable.createIndex(indexName, fromIndex.keyPath, { unique: fromIndex.unique, multiEntry: fromIndex.multiEntry });
      }
    }
  });
  for (const tableName of tableNames) {
    Console.info('[DB MIGRATION] copying from ' + dbName + '_' + latestEmail + '/' + tableName + ' to ' + dbName + '/' + tableName);
    await copyTable(previousDb, newDb, tableName);
  }

  // rename local directory
  const localFiles = injector.get(LocalFilesService);
  if (localFiles.supported()) await localFiles.renameDirectory(latestEmail + '/' + dbName, dbName).catch(() => true);

  // remove all user specific databases
  const existing = await globalThis.indexedDB.databases();
  for (const existingDb of existing) {
    if (existingDb.name?.startsWith(dbName + '_')) {
      globalThis.indexedDB.deleteDatabase(existingDb.name);
      if (localFiles.supported()) {
        const email = existingDb.name.substring(dbName.length + 1);
        if (email.length > 0)
          localFiles.deleteDirectoryAndContent(email + '/' + dbName);
      }
    }
  }

  Console.info('[DB MIGRATION] done from ' + dbName + '_' + latestEmail + ' to ' + dbName);

  return true;
}

async function copyTable(fromDb: IDBDatabase, toDb: IDBDatabase, tableName: string) {
  const fromTransaction = fromDb.transaction(tableName, 'readonly');
  const fromTable = fromTransaction.objectStore(tableName);
  await indexedDbCursorBatch(
    fromTable.openCursor(),
    100,
    items => {
      const toTransation = toDb.transaction(tableName, 'readwrite');
      const target = toTransation.objectStore(tableName);
      for (const item of items) target.add(item);
    },
    () => Promise.resolve(),
  );
}
