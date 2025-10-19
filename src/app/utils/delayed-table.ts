import { NgZone } from '@angular/core';
import { Table } from 'dexie';

export class DelayedTable<DTO, K> {

  constructor(
    private readonly ngZone: NgZone,
    public readonly table: Table<DTO, K>,
    private readonly keyName: string,
    private readonly chunkSize: number = 25,
    private readonly initialDelay: number = 500,
    private readonly subsequentDelay: number = 100,
  ) {}

  private readonly delayedItems = new Map<K, DTO>();
  private delay: any;

  public get(key: K): Promise<DTO | undefined> {
    const delayed = this.delayedItems.get(key);
    if (delayed) return Promise.resolve(delayed);
    return this.table.get(key);
  }

  public bulkGet(keys: K[]): Promise<(DTO | undefined)[]> {
    const remaining: K[] = [];
    const result: (DTO | undefined)[] = [];
    for (const key of keys) {
      const delayed = this.delayedItems.get(key);
      if (delayed) result.push(delayed);
      else {
        result.push(undefined);
        remaining.push(key);
      }
    }
    if (remaining.length === 0) return Promise.resolve(result);
    return this.table.bulkGet(remaining)
    .then(fromDb => {
      let j = 0;
      for (let i = 0; i < keys.length; ++i) {
        result[i] ??= fromDb[j++];
      }
      return result;
    })
  }

  public getBy(keyName: string, keyValue: any): Promise<DTO | undefined> {
    for (const value of this.delayedItems.values()) {
      if ((value as any)[keyName] === keyValue) return Promise.resolve(value);
    }
    const criteria: {[key: string]: any} = {};
    criteria[keyName] = keyValue;
    return this.table.get(criteria);
  }

  public put(item: DTO): void {
    this.delayedItems.set((item as any)[this.keyName], item);
    this.setDelay();
  }

  public bulkPut(items: DTO[]): void {
    for (const item of items) this.delayedItems.set((item as any)[this.keyName], item);
    this.setDelay();
  }

  private setDelay(): void {
    this.ngZone.runOutsideAngular(() => {
      this.delay ??= setTimeout(() => this.processDelayed(), this.initialDelay);
    });
  }

  private processDelayed(): void {
    const items: DTO[] = [];
    for (const item of this.delayedItems.values()) {
      items.push(item);
      if (items.length >= this.chunkSize) break;
    }
    this.table.bulkPut(items)
    .then(() => {
      for (const item of items) this.delayedItems.delete((item as any)[this.keyName]);
      if (this.delayedItems.size === 0) {
        this.delay = undefined;
      } else {
        this.ngZone.runOutsideAngular(() => {
          setTimeout(() => this.processDelayed(), this.subsequentDelay);
        });
      }
    });
  }

  public searchFirstIgnoreCase(field: string, value: string): Promise<DTO | undefined> {
    const v = value.toLowerCase();
    for (const item of this.delayedItems.values())
      if (v === (item as any)[field]?.toLowerCase()) return Promise.resolve(item);
    return this.table.where(field).equalsIgnoreCase(value).first();
  }
}
