export async function retry<T>(op: () => Promise<T>, nbRetry: number, canRetry?: (error: any) => boolean): Promise<T> {
  try {
    return await op();
  } catch (e) {
    if (canRetry && !canRetry(e)) throw e;
    if (nbRetry === 0) throw e;
    return await retry(op, nbRetry - 1, canRetry);
  }
}
