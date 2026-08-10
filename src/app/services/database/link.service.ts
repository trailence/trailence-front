import { Injectable, Injector } from '@angular/core';
import { SimpleStoreWithoutUpdate } from './store/simple-store-without-update';
import { TrailLink } from 'src/app/model/dto/trail-link';
import { HttpService } from '../http/http.service';
import { catchError, concatAll, EMPTY, from, map, Observable, switchMap, toArray } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Console } from 'src/app/utils/console';
import { TrailService } from './trail.service';
import { AuthService } from '../auth/auth.service';
import { CommonDatabaseService } from './common-database.service';
import { StoreService } from './store/store.service';

@Injectable({providedIn: 'root'})
export class TrailLinkService {

  private readonly store: TrailLinkStore;

  constructor(
    injector: Injector
  ) {
    this.store = new TrailLinkStore(injector);
  }

  public getLinkForTrail(trailOwner: string, trailUuid: string): TrailLink | undefined {
    return this.store.getAllNow().find(l => l.trailOwner === trailOwner && l.trailUuid === trailUuid);
  }

  public getLinkForTrail$(trailOwner: string, trailUuid: string): Observable<TrailLink | null> {
    return this.store.getOne$(i => i.trailOwner === trailOwner && i.trailUuid === trailUuid);
  }

  public getLinkForTrailReady$(trailOwner: string, trailUuid: string): Observable<TrailLink | null> {
    return this.store.getOneWhenLoaded$(i => i.trailOwner === trailOwner && i.trailUuid === trailUuid);
  }

  public getAllWhenReady$() { return this.store.getAllWhenLoaded$(); }

  public create(trailOwner: string, trailUuid: string): Observable<TrailLink | null> {
    return this.store.create({link: '', trailOwner, trailUuid, createdAt: Date.now()}, () => { this.store.triggerSyncNow(); });
  }

  public delete(link: TrailLink): void {
    this.store.delete(link);
  }

  public get storeLoaded$() { return this.store.isLoaded$; }

}

class TrailLinkStore extends SimpleStoreWithoutUpdate<TrailLink, TrailLink> {

  constructor(
    injector: Injector,
  ) {
    super(injector.get(CommonDatabaseService).publicLinksTable, injector);
    this.http = injector.get(HttpService);
  }

  private readonly http: HttpService;

  protected override fromDTO(dto: TrailLink): TrailLink {
    if (!dto.trailOwner) dto.trailOwner = this.injector.get(AuthService).email!; // backward compatibility
    return dto;
  }

  protected override toDTO(entity: TrailLink): TrailLink {
    if (!entity.trailOwner) entity.trailOwner = this.injector.get(AuthService).email!; // backward compatibility
    return entity;
  }

  protected override areSame(item1: TrailLink, item2: TrailLink): boolean {
    return item1.trailUuid === item2.trailUuid && item1.trailOwner === item2.trailOwner;
  }

  protected override createOnServer(items: TrailLink[]): Observable<TrailLink[]> {
    return from(items).pipe(
      map(item =>
        this.http.post<TrailLink>(environment.apiBaseUrl + '/trail-link/v2', {trailOwner: item.trailOwner, trailUuid: item.trailUuid}).pipe(
          catchError(e => {
            Console.error('Error creating trail link', item, e);
            return EMPTY;
          })
        )
      ),
      concatAll(),
      toArray()
    );
  }

  protected override deleteFromServer(items: TrailLink[]): Observable<void> {
    return from(items).pipe(
      map(item =>
        this.http.delete(environment.apiBaseUrl + '/trail-link/v2/' + (item.trailOwner ?? this.injector.get(AuthService).email!) + '/' + item.trailUuid).pipe(
          catchError(e => {
            Console.error('Error creating trail link', item, e);
            return EMPTY;
          })
        )
      ),
      concatAll(),
      toArray(),
      switchMap(r => EMPTY),
    );
  }

  protected override getAllFromServer(): Observable<TrailLink[]> {
    return this.http.get<TrailLink[]>(environment.apiBaseUrl + '/trail-link/v2');
  }

  protected override readyToSave(entity: TrailLink): boolean {
    return this.injector.get(TrailService).getTrail(entity.trailUuid, entity.trailOwner)?.isSavedOnServerAndNotDeletedLocally() ?? false;
  }

  protected override readyToSave$(entity: TrailLink): Observable<boolean> {
    return this.injector.get(TrailService).getTrail$(entity.trailUuid, entity.trailOwner).pipe(map(t => t?.isSavedOnServerAndNotDeletedLocally() ?? false));
  }

  protected override isQuotaReached(): boolean {
    return false;
  }

  protected override getKey(item: TrailLink): string {
    if (item.trailOwner === this.injector.get(AuthService).email)
      return item.trailUuid;
    return item.trailUuid + '#' + item.trailOwner;
  }

  protected override createdLocallyCanBeRemoved(entity: TrailLink): Observable<boolean> {
    return this.injector.get(TrailService).getTrail$(entity.trailUuid, entity.trailOwner).pipe(map(t => !t));
  }

  protected override updateEntityFromServer(fromServer: TrailLink, inStore: TrailLink): TrailLink | null {
    inStore.link = fromServer.link;
    inStore.createdAt = fromServer.createdAt;
    return inStore;
  }

  public triggerSyncNow(): void {
    this.injector.get(StoreService).triggerStoreSync(this.table.name);
  }

}
