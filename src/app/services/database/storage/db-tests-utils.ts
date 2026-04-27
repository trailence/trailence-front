export class DbTestsUtils {

  public static deleteDatabase(dbName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = e => resolve(e);
      request.onerror = e => reject(e);
    });
  };

  public static randomData(): Uint8Array<ArrayBuffer>[] {
    const nbChunks = Math.abs(Math.random() % 3) + 1;
    const chunks = [];
    for (let i = 0; i < nbChunks; ++i) {
      const chunkSize = Math.abs(Math.random() % 25000) + 1;
      const bytes = [];
      for (let j = 0; j < chunkSize; ++j) bytes.push(Math.abs(Math.random() % 256));
      const chunk = new Uint8Array(bytes);
      chunks.push(chunk);
    }
    return chunks;
  }

  public static async expectBlob(expected: Blob, found: Blob | undefined, ctx: string) {
    expect(found).withContext(ctx).toBeDefined();
    if (!found) return;
    const expectedBytes = await expected.bytes()
    const bytesFound = await found.bytes();
    expect(bytesFound).withContext(ctx).toEqual(expectedBytes);
  }

}
