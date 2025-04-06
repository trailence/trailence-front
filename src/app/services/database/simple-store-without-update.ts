import { Observable, of } from 'rxjs';
import { SimpleStore } from './simple-store';

export abstract class SimpleStoreWithoutUpdate<DTO, ENTITY> extends SimpleStore<DTO, ENTITY> {

  public override updateWithLock(item: ENTITY, updater: (latestVersion: ENTITY) => void, ondone?: (item: ENTITY) => void): void {
    throw new Error('Update not supported');
  }

  public override updateWithoutLock(item: ENTITY, ondone?: () => void): void {
    throw new Error('Update not supported');
  }

  protected override updated(item: ENTITY): void {
    // ignore
  }

  protected override updateToServer(items: DTO[]): Observable<DTO[]> {
    return of([]);
  }

}
