import { Injectable, NgZone } from "@angular/core";
import { OwnedStore, UpdatesResponse } from "./owned-store";
import { TagDto } from "src/app/model/dto/tag";
import { Tag } from "src/app/model/tag";
import { SimpleStore } from "./simple-store";
import { TrailTagDto } from "src/app/model/dto/trail-tag";
import { TrailTag } from "src/app/model/trail-tag";
import { Observable, combineLatest, filter, map, of, switchMap, zip } from "rxjs";
import { HttpService } from "../http/http.service";
import { environment } from "src/environments/environment";
import { DatabaseService, TAG_TABLE_NAME, TRAIL_TAG_TABLE_NAME } from "./database.service";
import { NetworkService } from "../network/network.service";
import { TrailCollectionService } from "./trail-collection.service";
import { VersionedDto } from "src/app/model/dto/versioned";
import { TrailService } from "./trail.service";
import { AuthService } from "../auth/auth.service";
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { Progress } from '../progress/progress.service';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';

@Injectable({
    providedIn: 'root'
})
export class TagService {

  private _tagStore: TagStore;
  private _trailTagStore: TrailTagStore;

  constructor(
    databaseService: DatabaseService,
    network: NetworkService,
    ngZone: NgZone,
    http: HttpService,
    collectionService: TrailCollectionService,
    trailService: TrailService,
    private auth: AuthService,
  ) {
    this._tagStore = new TagStore(databaseService, network, ngZone, http, collectionService);
    this._trailTagStore = new TrailTagStore(databaseService, network, ngZone, http, this, trailService, auth);
  }

  public getAllTags$(): Observable<Observable<Tag | null>[]> {
    return this._tagStore.getAll$();
  }

  public getTag$(uuid: string): Observable<Tag | null> {
    return this.auth.auth$.pipe(filter(auth => !!auth),switchMap(auth => this._tagStore.getItem$(uuid, auth!.email)))
  }

  public getTag(uuid: string): Tag | null {
    return this._tagStore.getItem(uuid, this.auth.email!);
  }

  public create(tag: Tag): Observable<Tag | null> {
    return this._tagStore.create(tag);
  }

  public update(tag: Tag): void {
    this._tagStore.update(tag);
  }

  public delete(tag: Tag, ondone?: () => void): void {
    this._trailTagStore.deleteIf(trailTag => trailTag.tagUuid === tag.uuid, () => {
      this._tagStore.delete(tag);
      if (ondone) ondone();
    });
  }

  public deleteTrailTagsForTrail(trailUuid: string, ondone?: () => void): void {
    this._trailTagStore.deleteIf(trailTag => trailTag.trailUuid === trailUuid, ondone);
  }

  public deleteAllTagsFromCollection(collectionUuid: string, owner: string, progress: Progress, progressWork: number): Observable<any> {
    return this._tagStore.getAll$().pipe(
      switchMap(tags$ => zip(tags$.map(tag$ => tag$.pipe(firstTimeout(t => !!t, 1000, () => null as Tag | null))))),
      switchMap(tags => {
        const toRemove = tags.filter(tag => !!tag && tag.collectionUuid === collectionUuid && tag.owner === owner);
        if (toRemove.length === 0) {
          progress.addWorkDone(progressWork)
          return of(true);
        }
        return new Observable(observer => {
          let done = 0;
          let workDone = 0;
          const ondone = () => {
            setTimeout(() => {
              done++;
              const newWorkDone = done * progressWork / toRemove.length;
              progress.addWorkDone(newWorkDone - workDone);
              workDone = newWorkDone;
              if (done === toRemove.length) {
                observer.next(true);
                observer.complete();
              }
            });
          };
          for (const tag of toRemove) setTimeout(() => this.delete(tag!, ondone), 0);
        });
      })
    );
  }

  public getTrailTags$(trailUuid: string): Observable<TrailTag[]> {
    return this._trailTagStore.getAll$().pipe(
      collection$items(trailTag => trailTag.trailUuid === trailUuid)
    );
  }

  public getTrailsTags$(trailsUuids: string[]): Observable<TrailTag[]> {
    return this._trailTagStore.getAll$().pipe(
      collection$items(trailTag => trailsUuids.indexOf(trailTag.trailUuid) >= 0)
    );
  }

  public addTrailTag(trailUuid: string, tagUuid: string) {
    this._trailTagStore.create(new TrailTag({trailUuid, tagUuid}));
  }

  public deleteTrailTag(trailUuid: string, tagUuid: string) {
    this._trailTagStore.delete(new TrailTag({trailUuid, tagUuid}));
  }

  public getTrailTagsNames$(trailUuid: string): Observable<string[]> {
    return this.getTrailTags$(trailUuid).pipe(
      switchMap(trailTags => {
        if (trailTags.length === 0) return of([]);
        return combineLatest(trailTags.map(trailTag => this.getTag$(trailTag.tagUuid).pipe(
          switchMap(tag => tag ? tag.name$ : of(undefined))
        )));
      }),
      map(names => names.filter(name => !!name) as string[])
    );
  }

}

class TagStore extends OwnedStore<TagDto, Tag> {

  constructor(
    databaseService: DatabaseService,
    network: NetworkService,
    ngZone: NgZone,
    private http: HttpService,
    private collectionService: TrailCollectionService,
  ) {
    super(TAG_TABLE_NAME, databaseService, network, ngZone);
  }

  protected override fromDTO(dto: TagDto): Tag {
    return new Tag(dto);
  }

  protected override toDTO(entity: Tag): TagDto {
    return entity.toDto();
  }

  protected override readyToSave(entity: Tag): boolean {
    if (entity.parentUuid && !this.getItem(entity.parentUuid, entity.owner)?.isSavedOnServerAndNotDeletedLocally()) return false;
    if (!this.collectionService.getCollection(entity.collectionUuid, entity.owner)?.isSavedOnServerAndNotDeletedLocally()) return false;
    return true;
  }

  protected override readyToSave$(entity: Tag): Observable<boolean> {
    const parentReady$ = entity.parentUuid ? this.getItem$(entity.parentUuid, entity.owner).pipe(map(tag => !!tag?.isSavedOnServerAndNotDeletedLocally())) : of(true);
    const collectionReady$ = this.collectionService.getCollection$(entity.collectionUuid, entity.owner).pipe(map(track => !!track?.isSavedOnServerAndNotDeletedLocally()));
    return combineLatest([parentReady$, collectionReady$]).pipe(
      map(readiness => readiness.indexOf(false) < 0)
    );
  }

  protected override createOnServer(items: TagDto[]): Observable<TagDto[]> {
    return this.http.post<TagDto[]>(environment.apiBaseUrl + '/tag/v1/_bulkCreate', items);
  }

  protected override getUpdatesFromServer(knownItems: VersionedDto[]): Observable<UpdatesResponse<TagDto>> {
    return this.http.post<UpdatesResponse<TagDto>>(environment.apiBaseUrl + '/tag/v1/_bulkGetUpdates', knownItems);
  }

  protected override sendUpdatesToServer(items: TagDto[]): Observable<TagDto[]> {
    return this.http.put<TagDto[]>(environment.apiBaseUrl + '/tag/v1/_bulkUpdate', items);
  }

  protected override deleteFromServer(uuids: string[]): Observable<void> {
    return this.http.post<void>(environment.apiBaseUrl + '/tag/v1/_bulkDelete', uuids);
  }

}

class TrailTagStore extends SimpleStore<TrailTagDto, TrailTag> {

  constructor(
    databaseService: DatabaseService,
    network: NetworkService,
    ngZone: NgZone,
    private http: HttpService,
    private tagService: TagService,
    private trailService: TrailService,
    private auth: AuthService,
  ) {
    super(TRAIL_TAG_TABLE_NAME, databaseService, network, ngZone);
  }

  protected override fromDTO(dto: TrailTagDto): TrailTag {
    return new TrailTag(dto);
  }

  protected override toDTO(entity: TrailTag): TrailTagDto {
    return entity.toDto();
  }

  protected override getKey(entity: TrailTag): string {
    return entity.trailUuid + '_' + entity.tagUuid;
  }

  protected override readyToSave(entity: TrailTag): boolean {
    if (!this.tagService.getTag(entity.tagUuid)?.isSavedOnServerAndNotDeletedLocally()) return false;
    if (!this.trailService.getTrail(entity.trailUuid, this.auth.email!)?.isSavedOnServerAndNotDeletedLocally()) return false;
    return true;
  }

  protected override readyToSave$(entity: TrailTag): Observable<boolean> {
    const tagReady$ = this.tagService.getTag$(entity.tagUuid).pipe(map(tag => !!tag?.isSavedOnServerAndNotDeletedLocally()));
    const trailReady$ = this.trailService.getTrail$(entity.trailUuid, this.auth.email!).pipe(map(track => !!track?.isSavedOnServerAndNotDeletedLocally()));
    return combineLatest([tagReady$, trailReady$]).pipe(
      map(readiness => readiness.indexOf(false) < 0)
    );
}

  protected override createOnServer(items: TrailTagDto[]): Observable<TrailTagDto[]> {
    return this.http.post<TrailTagDto[]>(environment.apiBaseUrl + '/tag/v1/trails/_bulkCreate', items);
  }

  protected override deleteFromServer(items: TrailTagDto[]): Observable<void> {
    return this.http.post<void>(environment.apiBaseUrl + '/tag/v1/trails/_bulkDelete', items);
  }

  protected override getAllFromServer(): Observable<TrailTagDto[]> {
    return this.http.get<TrailTagDto[]>(environment.apiBaseUrl + '/tag/v1/trails');
  }
}
