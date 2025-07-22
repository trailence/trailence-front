import { Injectable, Injector } from '@angular/core';
import { SimpleStoreWithoutUpdate } from './simple-store-without-update';
import { Observable, of } from 'rxjs';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { DatabaseService, MY_SELECTION_TABLE_NAME } from './database.service';
import Dexie from 'dexie';
import { collection$items } from 'src/app/utils/rxjs/collection$items';

@Injectable({providedIn: 'root'})
export class MySelectionService {

  private readonly store: MySelectionStore;

  constructor(
    injector: Injector,
  ) {
    this.store = new MySelectionStore(injector);
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
