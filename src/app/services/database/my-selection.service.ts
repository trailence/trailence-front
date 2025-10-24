import { Injectable, Injector } from '@angular/core';
import { SimpleStoreWithoutUpdate } from './simple-store-without-update';
import { catchError, combineLatest, concat, defaultIfEmpty, filter, Observable, of, switchMap, throwError, timeout } from 'rxjs';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { DatabaseService, MY_SELECTION_TABLE_NAME } from './database.service';
import Dexie from 'dexie';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { NetworkService } from '../network/network.service';
import { TrailService } from './trail.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { Console } from 'src/app/utils/console';

@Injectable({providedIn: 'root'})
export class MySelectionService {

  private readonly store: MySelectionStore;

  constructor(
    injector: Injector,
    network: NetworkService,
  ) {
    this.store = new MySelectionStore(injector);
    this.store.getAllWhenLoaded$().pipe(
      switchMap(items => combineLatest(items.map(item$ => item$.pipe(
        switchMap(item => {
          if (!item) return of(null);
          return injector.get(TrailService).getTrail$(item.uuid, item.owner).pipe(
            switchMap(trail => {
              if (trail) return of(trail);
              return concat(of(null), combineLatest([network.internet$, network.server$]).pipe(
                filter(([c1,c2]) => c1 && c2),
                switchMap(() => injector.get(TrailService).getTrail$(item.uuid, item.owner).pipe(
                  filterDefined(),
                  timeout(60000),
                  defaultIfEmpty(new Error('Trail not found: ' + item.owner + '/' + item.uuid)),
                  switchMap(e => e instanceof Error ? throwError(() => e) : of(e)),
                  catchError(e => {
                    Console.info('Removing trail from my selection because it seems deleted', item.owner, item.uuid, e);
                    this.deleteSelection(item.owner, item.uuid);
                    return of(null);
                  }),
                )),
              ));
            }),
          );
        })
      )))),
    ).subscribe();
  }

  public getMySelection(): Observable<SelectedTrail[]> {
    return this.store.getAllWhenLoaded$().pipe(collection$items());
  }

  public getMySelectionNow(): SelectedTrail[] {
    return this.store.getAllNow();
  }

  public addSelection(owner: string, uuid: string): Observable<SelectedTrail | null> {
    return this.store.create({owner, uuid});
  }

  public deleteSelection(owner: string, uuid: string) {
    return this.store.delete({owner, uuid});
  }

}

export interface SelectedTrail {
  owner: string;
  uuid: string;
}

class MySelectionStore extends SimpleStoreWithoutUpdate<SelectedTrail, SelectedTrail> {

  constructor(
    injector: Injector,
  ) {
    super(MY_SELECTION_TABLE_NAME, injector);
    this.http = injector.get(HttpService);
  }

  private readonly http: HttpService;

  protected override fromDTO(dto: SelectedTrail): SelectedTrail {
    return dto;
  }

  protected override toDTO(entity: SelectedTrail): SelectedTrail {
    return entity;
  }

  protected override areSame(item1: SelectedTrail, item2: SelectedTrail): boolean {
    return item1.owner === item2.owner && item1.uuid === item2.uuid;
  }

  protected override createOnServer(items: SelectedTrail[]): Observable<SelectedTrail[]> {
    return this.http.post<SelectedTrail[]>(environment.apiBaseUrl + '/user_selection/v1', items);
  }

  protected override deleteFromServer(items: SelectedTrail[]): Observable<void> {
    return this.http.post<void>(environment.apiBaseUrl + '/user_selection/v1/delete', items);
  }

  protected override getAllFromServer(): Observable<SelectedTrail[]> {
    return this.http.get<SelectedTrail[]>(environment.apiBaseUrl + '/user_selection/v1');
  }

  protected override readyToSave(entity: SelectedTrail): boolean {
    return true;
  }

  protected override readyToSave$(entity: SelectedTrail): Observable<boolean> {
    return of(true);
  }

  protected override isQuotaReached(): boolean {
    return false;
  }

  protected override getKey(item: SelectedTrail): string {
    return item.uuid + '#' + item.owner;
  }

  protected override migrate(fromVersion: number, dbService: DatabaseService): Promise<number | undefined> {
    return Promise.resolve(undefined);
  }

  protected override doCleaning(email: string, db: Dexie): Observable<any> {
    return of(true);
  }

  protected override createdLocallyCanBeRemoved(entity: SelectedTrail): Observable<boolean> {
    return of(false);
  }

}
