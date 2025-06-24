import { Injectable } from '@angular/core';
import Dexie from 'dexie';
import { Console } from 'src/app/utils/console';

@Injectable({providedIn: 'root'})
export class CacheService {

  private db?: Dexie;

  constructor() {}

  public createTimeoutCache<T>(key: (item: T) => string, timeout: number): TimeoutCache<T> {
    return new TimeoutCache<T>(key, timeout);
  }

  public createTimeoutCacheDb<T>(name: string, key: (item: T) => string, timeout: number): TimeoutCacheDb<T> {
    if (!this.db) {
      Console.info('Opening cache DB');
      this.db = new Dexie('trailence_cache');
      const storesV1: any = {};
      storesV1[TIMEOUT_CACHE_TABLE] = '&full_key, name, key';
      this.db.version(1).stores(storesV1);
    }
    return new TimeoutCacheDb<T>(this.db, name, key, timeout);
  }

}

interface TimeoutCacheItem<T> {
  date: number;
  item: T;
}

export class TimeoutCache<T> {

  private readonly cache: TimeoutCacheItem<T>[] = [];
  private hasTimeout = false;

  constructor(
    private readonly key: (item: T) => string,
    private readonly timeout: number,
  ) {}

  public feedItem(item: T): void {
    const key = this.key(item);
    const index = this.cache.findIndex(c => key === this.key(c.item));
    if (index >= 0) this.cache[index] = {date: Date.now(), item};
    else {
      this.cache.push({date: Date.now(), item});
      this.createTimeout();
    }
  }

  public feedList(items: T[]): void {
    items.forEach(item => this.feedItem(item));
    this.createTimeout();
  }

  public getItem(key: string): T | undefined {
    const c = this.cache.find(c => key === this.key(c.item));
    return c?.item;
  }

  public removeItem(key: string): void {
    const index = this.cache.findIndex(c => key === this.key(c.item));
    if (index >= 0) this.cache.splice(index, 1);
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

export class TimeoutCacheDb<T> {

  private hasTimeout = false;

  constructor(
    private readonly db: Dexie,
    private readonly name: string,
    private readonly key: (item: T) => string,
    private readonly timeout: number,
  ) {
  }

  public feedItem(item: T): void {
    const key = this.key(item);
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

  public feedList(items: T[]): void {
    this.db.transaction('rw', [TIMEOUT_CACHE_TABLE], async () => {
      await this.db.table<TimeoutCacheDbItem>(TIMEOUT_CACHE_TABLE).bulkPut(items.map(item => ({
        name: this.name,
        key: this.key(item),
        full_key: this.name + '__' + this.key(item),
        date: Date.now(),
        item: item,
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
