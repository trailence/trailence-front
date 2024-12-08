import { Injectable, Injector } from '@angular/core';
import { DatabaseService, DEPENDENCIES_TABLE_NAME } from './database.service';
import { Console } from 'src/app/utils/console';

@Injectable({providedIn: 'root'})
export class DependenciesService {

  constructor(
    private readonly injector: Injector,
  ) {}

  public operationDone(storeName: string, operation: ServerOperation, items: string[]): void {
    if (items.length === 0) return;
    const db = this.injector.get(DatabaseService).db;
    if (!db) return;
    const itemsToDelete = operation === 'delete' ? items.map(i => storeName + ';' + i) : [];
    db.transaction('rw', DEPENDENCIES_TABLE_NAME, () => {
      const table = db.table<Dependency>(DEPENDENCIES_TABLE_NAME);
      return table.toArray().then(dbItems => { // NOSONAR
        const itemsToSave: Dependency[] = [];
        const itemsToRemove: Dependency[] = [];
        for (const dbItem of dbItems) {
          if (itemsToDelete.indexOf(dbItem.key) >= 0) {
            Console.info('Element deleted on server: ' + dbItem.key + ' => remove all its dependencies');
            itemsToRemove.push(dbItem);
            continue;
          }
          const operationsToRemove: OperationDependencies[] = [];
          for (const itemOp of dbItem.operations) {
            const kept = itemOp.dependencies.filter(dep => {
              if (dep.storeName !== storeName || items.indexOf(dep.itemKey) < 0) return true; // keep it
              if (operation === 'delete' || operation === dep.operation) {
                Console.info('Dependency from ' + itemOp.operation + ' ' + dbItem.key + ' to ' + storeName + ' ' + dep + ' removed due to operation ' + operation + ' on it');
                return false;
              }
              return true;
            });
            if (kept.length === 0) {
              operationsToRemove.push(itemOp);
              Console.info('No more dependency from ' + itemOp.operation + ' ' + dbItem.key);
            } else if (kept.length !== itemOp.dependencies.length) {
              itemOp.dependencies = kept;
              if (itemsToSave.indexOf(dbItem) < 0)
                itemsToSave.push(dbItem);
            }
          }
          if (operationsToRemove.length > 0) {
            dbItem.operations = dbItem.operations.filter(o => operationsToRemove.indexOf(o) < 0);
            if (dbItem.operations.length === 0) {
              itemsToRemove.push(dbItem);
              Console.info('No more dependency from ' + dbItem.key);
            } else if (itemsToSave.indexOf(dbItem) < 0) {
              itemsToSave.push(dbItem);
            }
          }
        }
        let result: Promise<any> = Promise.resolve(true);
        if (itemsToRemove.length > 0) result = result.then(() => table.bulkDelete(itemsToRemove.map(i => i.key))); // NOSONAR
        if (itemsToSave.length > 0) result = result.then(() => table.bulkPut(itemsToSave));
        return result;
      });
    }).then(() => {});
  }

  public addDependencies(storeName: string, itemKey: string, operation: ServerOperation, dependencies: {storeName: string, itemKey: string, operation: ServerOperation}[]): Promise<any> {
    const db = this.injector.get(DatabaseService).db;
    if (!db) return Promise.resolve(false);
    Console.info('Add dependencies from ' + operation + ' ' + storeName  + ' ' + itemKey + ' to ', dependencies);
    return db.transaction('rw', DEPENDENCIES_TABLE_NAME, () => {
      const table = db.table<Dependency>(DEPENDENCIES_TABLE_NAME);
      const key = storeName + ';' + itemKey;
      return table.get(key).then(dbItem => {
        if (!dbItem) {
          return table.put({
            key,
            operations: [{
              operation,
              dependencies,
            }]
          });
        }
        const op = dbItem.operations.find(o => o.operation === operation);
        if (!op) {
          dbItem.operations.push({operation, dependencies});
        } else {
          for (const dep of dependencies) {
            if (op.dependencies.findIndex(d => d.storeName === dep.storeName && d.itemKey === dep.itemKey && d.operation === dep.operation) < 0)
              op.dependencies.push(dep);
          }
        }
        return table.put(dbItem);
      });
    });
  }

  public canDo(storeName: string, operation: ServerOperation, items: string[]): Promise<string[]> {
    const db = this.injector.get(DatabaseService).db;
    if (!db) return Promise.resolve([]);
    const keys = items.map(i =>storeName + ';' + i);
    return db.table<Dependency>(DEPENDENCIES_TABLE_NAME).bulkGet(keys).then(dbItems => {
      const result: string[] = [];
      for (let i = 0; i < dbItems.length; ++i) {
        const dbItem = dbItems[i];
        if (!dbItem) {
          // no dependency => ok
          result.push(items[i]);
        } else {
          const itemOp = dbItem.operations.find(o => o.operation === operation);
          if (!itemOp) {
            // no dependency for this operation => ok
            result.push(items[i]);
          } else {
            // has dependencis => not ok
          }
        }
      }
      return result;
    });
  }

}

export type ServerOperation = 'create' | 'update' | 'delete';

interface StoreOperationItem {
  storeName: string;
  itemKey: string;
  operation: ServerOperation;
}

interface Dependency {
  key: string;
  operations: OperationDependencies[];
}

interface OperationDependencies {
  operation: string;
  dependencies: StoreOperationItem[];
}
