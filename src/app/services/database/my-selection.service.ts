import { Injectable, Injector } from '@angular/core';
import { SimpleStoreWithoutUpdate } from './store/simple-store-without-update';
import { Observable, of } from 'rxjs';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { CommonDatabaseService } from './common-database.service';

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
    super(injector.get(CommonDatabaseService).mySelectionTable, injector);
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

  protected override createdLocallyCanBeRemoved(entity: SelectedTrail): Observable<boolean> {
    return of(false);
  }

}
