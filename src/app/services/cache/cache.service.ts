import { Injectable } from '@angular/core';
import Dexie from 'dexie';
import { Console } from 'src/app/utils/console';

@Injectable({providedIn: 'root'})
export class CacheService {

  private db?: Dexie;

  constructor() {}

  public createTimeoutCache<T>(timeout: number): TimeoutCache<T> {
    return new TimeoutCache<T>(timeout);
  }

  public createTimeoutCacheDb<T>(name: string, timeout: number): TimeoutCacheDb<T> {
    if (!this.db) {
      Console.info('Opening cache DB');
      this.db = new Dexie('trailence_cache');
      const storesV1: any = {};
      storesV1[TIMEOUT_CACHE_TABLE] = '&full_key, name, key';
      this.db.version(1).stores(storesV1);
    }
    return new TimeoutCacheDb<T>(this.db, name, timeout);
  }

}

export interface Cache<T> {
  feedItem(key: string, item: T): void;
  feedList(items: {key: string, item: T}[]): void;
  getItem(key: string): Promise<T | undefined>;
  removeItem(key: string): Promise<boolean>;
}

interface TimeoutCacheItem<T> {
  date: number;
  key: string;
  item: T;
}

export class TimeoutCache<T> implements Cache<T> {

  private readonly cache: TimeoutCacheItem<T>[] = [];
  private hasTimeout = false;

  constructor(
    private readonly timeout: number,
  ) {}

  public feedItem(key: string, item: T): void {
    const index = this.cache.findIndex(c => key === c.key);
    if (index >= 0) this.cache[index] = {date: Date.now(), key, item};
    else {
      this.cache.push({date: Date.now(), key, item});
      this.createTimeout();
    }
  }

  public feedList(items: {key: string, item: T}[]): void {
    for (const item of items) this.feedItem(item.key, item.item);
    this.createTimeout();
  }

  public getItem(key: string): Promise<T | undefined> {
    const c = this.cache.find(c => key === c.key);
    return Promise.resolve(c?.item);
  }

  public removeItem(key: string): Promise<boolean> {
    const index = this.cache.findIndex(c => key === c.key);
    if (index >= 0) this.cache.splice(index, 1);
    return Promise.resolve(index >= 0);
  }

  private clean(): void {
    const max = Date.now() - this.timeout;
    for (let i = 0; i < this.cache.length; ++i) {
      if (this.cache[i].date < max) {
        this.cache.splice(i, 1);
        i--;
      }
    }
    this.createTimeout();
  }

  private createTimeout(): void {
    if (this.hasTimeout || this.cache.length === 0) return;
    this.hasTimeout = true;
    setTimeout(() => {
      this.hasTimeout = false;
      this.clean();
    }, this.timeout * 2 / 3);
  }

}

const TIMEOUT_CACHE_TABLE = 'cache_timeout';

interface TimeoutCacheDbItem {
  name: string;
  key: string;
  full_key: string;
  date: number;
  item: any;
}

export class TimeoutCacheDb<T> implements Cache<T> {

  private hasTimeout = false;

  constructor(
    private readonly db: Dexie,
    private readonly name: string,
    private readonly timeout: number,
  ) {
  }

  public feedItem(key: string, item: T): void {
    this.db.transaction('rw', [TIMEOUT_CACHE_TABLE], async () => {
      await this.db.table<TimeoutCacheDbItem>(TIMEOUT_CACHE_TABLE).put({
        name: this.name,
        key: key,
        full_key: this.name + '__' + key,
        date: Date.now(),
        item: item,
      });
      await this.createTimeout();
    });
  }

  public feedList(items: {key: string, item: T}[]): void {
    this.db.transaction('rw', [TIMEOUT_CACHE_TABLE], async () => {
      await this.db.table<TimeoutCacheDbItem>(TIMEOUT_CACHE_TABLE).bulkPut(items.map(item => ({
        name: this.name,
        key: item.key,
        full_key: this.name + '__' + item.key,
        date: Date.now(),
        item: item.item,
      })));
      await this.createTimeout();
    });
  }

  public async getItem(key: string): Promise<T | undefined> {
    const c = await this.db.table<TimeoutCacheDbItem>(TIMEOUT_CACHE_TABLE).get(this.name + '__' + key);
    return c?.item;
  }

  public async removeItem(key: string) {
    await this.db.table<TimeoutCacheDbItem>(TIMEOUT_CACHE_TABLE).delete(this.name + '__' + key);
    return true;
  }

  private clean(): void {
    const max = Date.now() - this.timeout;
    this.db.transaction('rw', [TIMEOUT_CACHE_TABLE], async () => {
      await this.db.table<TimeoutCacheDbItem>(TIMEOUT_CACHE_TABLE).where('name').equals(this.name).and(i => i.date < max).delete();
      await this.createTimeout();
    });
  }

  private async createTimeout() {
    if (this.hasTimeout) return;
    const item = await this.db.table<TimeoutCacheDbItem>(TIMEOUT_CACHE_TABLE).where('name').equals(this.name).first();
    if (!item) return;
    if (this.hasTimeout) return;
    this.hasTimeout = true;
    setTimeout(() => {
      this.hasTimeout = false;
      this.clean();
    }, this.timeout * 2 / 3);
  }

}
