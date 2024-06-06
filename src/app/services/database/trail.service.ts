import { Injectable, NgZone } from '@angular/core';
import { OwnedStore, UpdatesResponse } from './owned-store';
import { DatabaseService, TRAIL_TABLE_NAME } from './database.service';
import { HttpService } from '../http/http.service';
import { Observable, combineLatest, filter, map } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Versioned } from 'src/app/model/versioned';
import { NetworkService } from '../network/newtork.service';
import { Trail } from 'src/app/model/trail';
import { TrailDto } from 'src/app/model/dto/trail';
import { TrackService } from './track.service';
import { TrailCollectionService } from './trail-collection.service';
import { VersionedDto } from 'src/app/model/dto/versioned';
import { MenuItem } from 'src/app/utils/menu-item';
import { AuthService } from '../auth/auth.service';
import { CollectionObservable } from 'src/app/utils/rxjs/observable-collection';

@Injectable({
  providedIn: 'root'
})
export class TrailService {

  private _store: TrailStore;

  constructor(
    databaseService: DatabaseService,
    network: NetworkService,
    ngZone: NgZone,
    http: HttpService,
    private trackService: TrackService,
    collectionService: TrailCollectionService,
    private auth: AuthService,
  ) {
    this._store = new TrailStore(databaseService, network, ngZone, http, trackService, collectionService);
  }

  public getAll$(): CollectionObservable<Observable<Trail | null>> {
    return this._store.getAll$();
  }

  public getAllForCollectionUuid$(colletionUuid: string): CollectionObservable<Observable<Trail | null>> {
    return this._store.filter$(trail => trail.collectionUuid === colletionUuid);
  }

  public getTrail$(uuid: string, owner: string): Observable<Trail | null> {
    return this._store.getItem$(uuid, owner);
  }

  public getTrail(uuid: string, owner: string): Trail | null {
    return this._store.getItem(uuid, owner);
  }

  public create(trail: Trail): Observable<Trail | null> {
    return this._store.create(trail);
  }

  public update(trail: Trail): void {
    this._store.update(trail);
  }

  public delete(trail: Trail): void {
    this.trackService.deleteByUuidAndOwner(trail.originalTrackUuid, trail.owner);
    if (trail.currentTrackUuid !== trail.originalTrackUuid)
      this.trackService.deleteByUuidAndOwner(trail.currentTrackUuid, trail.owner);
    this._store.delete(trail);
  }

  public getTrailMenu(trail: Trail): MenuItem[] {
    const menu: MenuItem[] = [];
    if (trail.owner === this.auth.email) {
      // TODO add confirmation
      menu.push(new MenuItem().setIcon('trash').setI18nLabel('buttons.delete').setAction(() => this.delete(trail)));
    }
    return menu;
  }

}

class TrailStore extends OwnedStore<TrailDto, Trail> {

  constructor(
    databaseService: DatabaseService,
    network: NetworkService,
    ngZone: NgZone,
    private http: HttpService,
    private trackService: TrackService,
    private collectionService: TrailCollectionService,
  ) {
    super(TRAIL_TABLE_NAME, databaseService, network, ngZone);
  }

  protected override fromDTO(dto: TrailDto): Trail {
    return new Trail(dto);
  }

  protected override toDTO(entity: Trail): TrailDto {
    return entity.toDto();
  }

  protected override readyToSave(entity: Trail): boolean {
    if (!this.collectionService.getCollection(entity.collectionUuid, entity.owner)?.isSavedOnServerAndNotDeletedLocally()) return false;
    if (!this.trackService.isSavedOnServerAndNotDeletedLocally(entity.originalTrackUuid, entity.owner)) return false;
    if (entity.currentTrackUuid !== entity.originalTrackUuid &&
      !this.trackService.isSavedOnServerAndNotDeletedLocally(entity.currentTrackUuid, entity.owner)) return false;
    return true;
  }

  protected override readyToSave$(entity: Trail): Observable<boolean> {
    const originalTrackReady$ = this.trackService.isSavedOnServerAndNotDeletedLocally$(entity.originalTrackUuid, entity.owner);
    const currentrackReady$ = this.trackService.isSavedOnServerAndNotDeletedLocally$(entity.currentTrackUuid, entity.owner);
    const collectionReady$ = this.collectionService.getCollection$(entity.collectionUuid, entity.owner).pipe(map(track => !!track?.isSavedOnServerAndNotDeletedLocally()));
    return combineLatest([originalTrackReady$, currentrackReady$, collectionReady$]).pipe(
      map(readiness => readiness.indexOf(false) < 0)
    );
  }

  protected override createOnServer(items: TrailDto[]): Observable<TrailDto[]> {
    return this.http.post<TrailDto[]>(environment.apiBaseUrl + '/trail/v1/_bulkCreate', items);
  }

  protected override getUpdatesFromServer(knownItems: VersionedDto[]): Observable<UpdatesResponse<TrailDto>> {
    return this.http.post<UpdatesResponse<TrailDto>>(environment.apiBaseUrl + '/trail/v1/_bulkGetUpdates', knownItems);
  }

  protected override sendUpdatesToServer(items: TrailDto[]): Observable<TrailDto[]> {
    return this.http.put<TrailDto[]>(environment.apiBaseUrl + '/trail/v1/_bulkUpdate', items);
  }

  protected override deleteFromServer(uuids: string[]): Observable<void> {
    return this.http.post<void>(environment.apiBaseUrl + '/trail/v1/_bulkDelete', uuids);
  }

}
