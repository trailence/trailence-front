export function openIndexedDb(dbName: string, version?: number, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = globalThis.indexedDB.open(dbName, version);
    request.onerror = () => reject(request.error);
    if (upgrade) {
      request.onupgradeneeded = event => {
        const db = (event.target as any).result as IDBDatabase;
        upgrade(db);
      };
    }
    request.onsuccess = () => resolve(request.result);
  });
}

export function indexedDbCursor<T>(cursorRequest: IDBRequest<IDBCursorWithValue | null>, onEach: (item: any) => void, onEnd: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    cursorRequest.onerror = () => reject(cursorRequest.error);
    cursorRequest.onsuccess = event => {
      const cursor = (event.target as any).result as IDBCursorWithValue | null;
      if (cursor) {
        onEach(cursor.value);
        cursor.continue();
      } else {
        onEnd().then(result => resolve(result)).catch(reject);
      }
    };
  });
}

export function indexedDbCursorBatch<T>(cursorRequest: IDBRequest<IDBCursorWithValue | null>, batchSize: number, onBatch: (items: any[]) => void, onEnd: () => Promise<T>): Promise<T> {
  let batch: any[] | undefined = undefined;
  return indexedDbCursor(
    cursorRequest,
    item => {
      if (batch) batch.push(item);
      else batch = [item];
      if (batch.length >= batchSize) {
        const items = batch;
        batch = undefined;
        onBatch(items);
      }
    },
    () => {
      if (batch) onBatch(batch);
      return onEnd();
    },
  );
}

export function indexedDbRequestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
