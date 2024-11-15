import { Maps } from 'src/app/utils/maps';

export class SynchronizationLocks {

  private readonly syncing: string[] = [];
  private readonly locks = new Map<string, number>();
  private readonly locksRequest = new Map<string, (() => void)[]>();

  public lock(key: string, onlocked: (locked: boolean) => void): void {
    if (this.syncing.indexOf(key) >= 0) {
      Maps.push(key, onlocked, this.locksRequest);
    } else {
      Maps.increment(key, this.locks);
      onlocked(true);
    }
  }

  public unlock(key: string): void {
    Maps.decrement(key, this.locks);
  }

  public startSync(key: string): boolean {
    if (this.locks.has(key)) return false;
    this.syncing.push(key);
    return true;
  }

  public syncDone(key: string): void {
    const index = this.syncing.indexOf(key);
    if (index >= 0) this.syncing.splice(index, 1);
    const requests = this.locksRequest.get(key);
    if (requests) {
      this.locksRequest.delete(key);
      for (const request of requests) this.lock(key, request);
    }
  }

}
