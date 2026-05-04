import { Injectable, Injector } from '@angular/core';
import { Console } from 'src/app/utils/console';
import { DbTable } from './storage/db-table';
import { CommonDatabaseService } from './common-database.service';
import { EMPTY, firstValueFrom, map, Observable, of, switchMap } from 'rxjs';

@Injectable({providedIn: 'root'})
export class DependenciesService {

  constructor(
    injector: Injector,
  ) {
    this.table = injector.get(CommonDatabaseService).dependenciesTable;
  }

  private readonly table: DbTable<Dependency>;

  private readonly events = new Map<string, {storeName: string, itemKey: string, operation: ServerOperation}[]>();

  public operationDone(storeName: string, operation: ServerOperation, items: string[]): void {
    if (items.length === 0) return;
    const itemsToDelete = operation === 'delete' ? items.map(i => storeName + ';' + i) : [];
    this.table.inTransaction$(false, stillValid =>
      this.table.getAll$().pipe(
        switchMap(dbItems => {
          if (!stillValid()) return EMPTY;
          const itemsToSave: Dependency[] = [];
          const itemsToRemove: Dependency[] = [];
          for (const dbItem of dbItems) {
            if (itemsToDelete.includes(dbItem.key)) {
              Console.info('Element deleted on server: ' + dbItem.key + ' => remove all its dependencies');
              itemsToRemove.push(dbItem);
              continue;
            }
            const operationsToRemove: OperationDependencies[] = [];
            for (const itemOp of dbItem.operations) {
              const kept = itemOp.dependencies.filter(dep => {
                if (dep.storeName !== storeName || !items.includes(dep.itemKey)) return true; // keep it
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
                if (!itemsToSave.includes(dbItem))
                  itemsToSave.push(dbItem);
              }
            }
            if (operationsToRemove.length > 0) {
              dbItem.operations = dbItem.operations.filter(o => !operationsToRemove.includes(o));
              if (dbItem.operations.length === 0) {
                itemsToRemove.push(dbItem);
                Console.info('No more dependency from ' + dbItem.key);
              } else if (!itemsToSave.includes(dbItem)) {
                itemsToSave.push(dbItem);
              }
            }
          }
          let result$: Observable<any> = of(true);
          if (itemsToRemove.length > 0) result$ = result$.pipe(switchMap(() => this.table.deleteMany$(itemsToRemove.map(i => i.key))));
          if (itemsToSave.length > 0) result$ = result$.pipe(switchMap(() => this.table.setMany$(itemsToSave)));
          return result$;

        })
      )
    ).subscribe();
  }

  public addDependencies(storeName: string, itemKey: string, operation: ServerOperation, dependencies: {storeName: string, itemKey: string, operation: ServerOperation}[]): Promise<any> {
    Console.info('Add dependencies from ' + operation + ' ' + storeName  + ' ' + itemKey + ' to ', dependencies);
    const key = storeName + ';' + itemKey;
    return firstValueFrom(this.table.inTransaction$(false, stillValid =>
      this.table.getByKey$(key).pipe(
        switchMap(dbItem => {
          if (!dbItem) {
            return this.table.setOne$({
              key,
              operations: [{
                operation,
                dependencies,
              }]
            });
          }
          const op = dbItem.operations.find(o => o.operation === operation);
          if (op) {
            for (const dep of dependencies) {
              if (!op.dependencies.some(d => d.storeName === dep.storeName && d.itemKey === dep.itemKey && d.operation === dep.operation))
                op.dependencies.push(dep);
            }
          } else {
            dbItem.operations.push({operation, dependencies});
          }
          return this.table.setOne$(dbItem);
        })
      )
    ));
  }

  public addEventDependency(storeName: string, itemKey: string, operation: ServerOperation, eventId: string): void {
    Console.info('Add dependency on event ' + eventId + ' for ' + operation + ' ' + storeName + ' ' + itemKey);
    const event = this.events.get(eventId);
    if (event) event.push({storeName, itemKey, operation});
    else this.events.set(eventId, [{storeName, itemKey, operation}]);
  }

  public fireEvent(eventId: string): void {
    Console.info('Remove dependencies on event ' + eventId);
    this.events.delete(eventId);
  }

  public canDo(storeName: string, operation: ServerOperation, items: string[]): Promise<string[]> {
    const filter1 = [...items];
    for (const event of this.events.values()) {
      for (const item of event) {
        if (item.storeName === storeName && item.operation === operation) {
          const index = filter1.indexOf(item.itemKey);
          if (index >= 0) filter1.splice(index, 1);
        }
      }
    }
    if (filter1.length === 0) return Promise.resolve([]);
    const keys = filter1.map(i =>storeName + ';' + i);
    return firstValueFrom(this.table.getByKeys$(keys).pipe(
      map(dbItems => {
        const result: string[] = [];
        for (let i = 0; i < keys.length; ++i) {
          const key = keys[i];
          const dbItem = dbItems.find(i => i.key === key);
          if (dbItem) {
            const itemOp = dbItem.operations.find(o => o.operation === operation);
            if (itemOp) {
              // has dependencis => not ok
            } else {
              // no dependency for this operation => ok
              result.push(filter1[i]);
            }
          } else {
            // no dependency => ok
            result.push(filter1[i]);
          }
        }
        return result;
      })
    ))
  }

  // TODO add an expiration on dependencies ?
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
