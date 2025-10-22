export class PendingRequests<T> {

  private readonly _pending = new Map<string, Promise<T | null>>();

  public request(key: string, request: () => Promise<T | null>): Promise<T | null> {
    let pending = this._pending.get(key);
    if (pending) return pending;
    pending = request();
    this._pending.set(key, pending);
    pending = pending.then(result => {
      this._pending.delete(key);
      return result;
    }).catch(e => {
      this._pending.delete(key);
      throw e;
    });
    return pending;
  }

}

export class PendingRequestsMultiple<T> {

  private readonly _pendingSingle = new Map<string, Promise<T | null>>();
  private readonly _pendingMultiple = new Map<string, Promise<T[]>>();

  constructor(
    private readonly multipleToSingle: (results: T[], key: string) => T | null,
  ) {}

  public requestSingle(key: string, request: () => Promise<T | null>): Promise<T | null> {
    let pending = this._pendingSingle.get(key);
    if (pending) return pending;
    const pendingMultiple = this._pendingMultiple.get(key);
    if (pendingMultiple) return pendingMultiple.then(results => this.multipleToSingle(results, key));
    pending = request();
    this._pendingSingle.set(key, pending);
    pending = pending.then(result => {
      this._pendingSingle.delete(key);
      return result;
    });
    return pending;
  }

  public requestMultiple(keys: string[], request: (keys: string[]) => Promise<T[]>): Promise<T[]> {
    const missingKeys: string[] = [];
    const pendingKeys: Promise<T | null>[] = [];
    for (const key of keys) {
      const pendingSingle = this._pendingSingle.get(key);
      if (pendingSingle) {
        pendingKeys.push(pendingSingle);
        continue;
      }
      const pendingMultiple = this._pendingMultiple.get(key);
      if (pendingMultiple) {
        pendingKeys.push(pendingMultiple.then(results => this.multipleToSingle(results, key)));
        continue;
      }
      missingKeys.push(key);
    }
    if (pendingKeys.length === 0) {
      let r = request(keys);
      for (const key of keys) {
        this._pendingMultiple.set(key, r);
      }
      r = r.then(results => {
        for (const key of keys) {
          this._pendingMultiple.delete(key);
        }
        return results;
      });
      return r;
    }
    if (missingKeys.length > 0) {
      let r = request(missingKeys);
      for (const key of missingKeys) {
        this._pendingMultiple.set(key, r);
        pendingKeys.push(r.then(results => this.multipleToSingle(results, key)));
      }
      r.then(() => {
        for (const key of missingKeys) {
          this._pendingMultiple.delete(key);
        }
      });
    }
    return Promise.all(pendingKeys).then(results => results.filter(r => r !== null));
  }

}
