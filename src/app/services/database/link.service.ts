import { Injectable, Injector } from '@angular/core';
import { SimpleStoreWithoutUpdate } from './simple-store-without-update';
import { TrailLink } from 'src/app/model/dto/trail-link';
import { DatabaseService, TRAIL_LINKS_TABLE_NAME } from './database.service';
import { HttpService } from '../http/http.service';
import { catchError, concat, concatAll, EMPTY, forkJoin, from, map, Observable, of, switchMap, toArray } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Console } from 'src/app/utils/console';
import { TrailService } from './trail.service';
import { AuthService } from '../auth/auth.service';
import Dexie from 'dexie';

@Injectable({providedIn: 'root'})
export class TrailLinkService {

  private readonly store: TrailLinkStore;

  constructor(
    injector: Injector
  ) {
    this.store = new TrailLinkStore(injector);
  }

  public getLinkForTrail(trailUuid: string): TrailLink | undefined {
    return this.store.getAllNow().find(l => l.trailUuid === trailUuid);
  }

  public getLinkForTrail$(trailUuid: string): Observable<TrailLink | null> {
    return this.store.getOne$(i => i.trailUuid === trailUuid);
  }

  public getLinkForTrailReady$(trailUuid: string): Observable<TrailLink | null> {
    return this.store.getOneWhenLoaded$(i => i.trailUuid === trailUuid);
  }

  public create(trailUuid: string): Observable<TrailLink | null> {
    return this.store.create({link: '', trailUuid, createdAt: Date.now()}, () => { this.store.triggerSyncNow(); });
  }

  public delete(link: TrailLink): void {
    this.store.delete(link);
  }

}

class TrailLinkStore extends SimpleStoreWithoutUpdate<TrailLink, TrailLink> {

  constructor(
    injector: Injector,
  ) {
    super(TRAIL_LINKS_TABLE_NAME, injector);
    this.http = injector.get(HttpService);
  }

  private readonly http: HttpService;

  protected override fromDTO(dto: TrailLink): TrailLink {
    return dto;
  }

  protected override toDTO(entity: TrailLink): TrailLink {
    return entity;
  }

  protected override areSame(item1: TrailLink, item2: TrailLink): boolean {
    return item1.trailUuid === item2.trailUuid;
  }

  protected override createOnServer(items: TrailLink[]): Observable<TrailLink[]> {
    return from(items).pipe(
      map(item =>
        this.http.post<TrailLink>(environment.apiBaseUrl + '/trail-link/v1', item.trailUuid).pipe(
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
        this.http.delete(environment.apiBaseUrl + '/trail-link/v1/' + item.trailUuid).pipe(
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
    return this.http.get<TrailLink[]>(environment.apiBaseUrl + '/trail-link/v1');
  }

  protected override readyToSave(entity: TrailLink): boolean {
    const email = this.injector.get(AuthService).email;
    if (!email) return false;
    return this.injector.get(TrailService).getTrail(entity.trailUuid, email)?.isSavedOnServerAndNotDeletedLocally() ?? false;
  }

  protected override readyToSave$(entity: TrailLink): Observable<boolean> {
    const email = this.injector.get(AuthService).email
    if (!email) return of(false);
    return this.injector.get(TrailService).getTrail$(entity.trailUuid, email).pipe(map(t => t?.isSavedOnServerAndNotDeletedLocally() ?? false));
  }

  protected override isQuotaReached(): boolean {
    return false;
  }

  protected override getKey(item: TrailLink): string {
    return item.trailUuid;
  }

  protected override migrate(fromVersion: number, dbService: DatabaseService): Promise<number | undefined> {
    return Promise.resolve(undefined);
  }

  protected override doCleaning(email: string, db: Dexie): Observable<any> {
    return of(true);
  }

  protected override createdLocallyCanBeRemoved(entity: TrailLink): Observable<boolean> {
    const email = this.injector.get(AuthService).email
    if (!email) return of(false);
    return this.injector.get(TrailService).getTrail$(entity.trailUuid, email).pipe(map(t => !t));
  }

  protected override updateEntityFromServer(fromServer: TrailLink, inStore: TrailLink): TrailLink | null {
    inStore.link = fromServer.link;
    inStore.createdAt = fromServer.createdAt;
    return inStore;
  }

  public triggerSyncNow(): void {
    this.injector.get(DatabaseService).triggerStoreSync(this.tableName);
  }

}
