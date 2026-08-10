import { Injectable, Injector } from "@angular/core";
import { OwnedStore, UpdatesResponse } from "./store/owned-store";
import { TagDto } from "src/app/model/dto/tag";
import { Tag } from "src/app/model/tag";
import { TrailTagDto } from "src/app/model/dto/trail-tag";
import { TrailTag } from "src/app/model/trail-tag";
import { EMPTY, Observable, combineLatest, filter, first, firstValueFrom, map, of, switchMap, tap, throwError, zip } from "rxjs";
import { HttpService } from "../http/http.service";
import { environment } from "src/environments/environment";
import { TrailCollectionService } from "./trail-collection.service";
import { VersionedDto } from "src/app/model/dto/versioned";
import { TrailService } from "./trail.service";
import { AuthService } from "../auth/auth.service";
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { Progress } from '../progress/progress.service';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import { CompositeOnDone } from 'src/app/utils/callback-utils';
import { QuotaService } from '../auth/quota.service';
import { SimpleStoreWithoutUpdate } from './store/simple-store-without-update';
import { ShareService } from './share.service';
import { CommonDatabaseService } from './common-database.service';
import { StoreWithCleaning } from './store/store.service';
import { SHARED_OWNER_PREFIX, TrailCollectionType } from 'src/app/model/dto/trail-collection';
import { Trail } from 'src/app/model/trail';
import { TrailCollection } from 'src/app/model/trail-collection';

@Injectable({
    providedIn: 'root'
})
export class TagService {

  private readonly _tagStore: TagStore;
  private readonly _trailTagStore: TrailTagStore;

  constructor(
    private readonly injector: Injector,
    http: HttpService,
    collectionService: TrailCollectionService,
    trailService: TrailService,
    private readonly auth: AuthService,
  ) {
    this._tagStore = new TagStore(injector, http, collectionService);
    this._trailTagStore = new TrailTagStore(injector, http, this, trailService, auth);
  }

  public getAllTags$(): Observable<Observable<Tag | null>[]> {
    return this._tagStore.getAll$();
  }

  public getTag$(owner: string, uuid: string): Observable<Tag | null> {
    return this._tagStore.getItem$(uuid, owner);
  }

  public getTag(owner: string, uuid: string): Tag | null {
    return this._tagStore.getItem(uuid, owner);
  }

  public create(tag: Tag, ondone?: () => void): Observable<Tag | null> {
    if (!tag.owner.startsWith(SHARED_OWNER_PREFIX) && !this.injector.get(QuotaService).checkQuota(q => q.tagsUsed + this._tagStore.getNbLocalCreates() >= q.tagsMax, 'tags'))
      return throwError(() => new Error('quota reached'));
    return this._tagStore.create(tag, ondone);
  }

  public update(tag: Tag, updater: (tag: Tag) => void, ondone?: (tag: Tag) => void): void {
    this._tagStore.updateWithLock(tag, updater, ondone);
  }

  public delete(tag: Tag, ondone?: () => void): void {
    this._trailTagStore.deleteIf('delete single tag', trailTag => trailTag.tagUuid === tag.uuid && trailTag.owner === tag.owner, () => {
      this._tagStore.delete(tag, ondone);
    });
  }

  public deleteMany(tags: Tag[], ondone?: () => void): void {
    if (tags.length === 0) {
      if (ondone) ondone();
      return;
    }
    this._trailTagStore.deleteIf('delete multiple tags', trailTag => tags.some(t => trailTag.tagUuid === t.uuid && trailTag.owner === t.owner), () => {
      this._tagStore.deleteIf('delete multiple tags', tag => tags.some(t => tag.uuid === t.uuid && tag.owner === t.owner), ondone);
    });
  }

  public deleteTrailTagsForTrail(owner: string, trailUuid: string, ondone?: () => void): void {
    this._trailTagStore.deleteIf('delete single trail', trailTag => trailTag.trailUuid === trailUuid && trailTag.owner === owner, ondone);
  }

  public deleteTrailTagsForTrails(trails: Trail[], ondone?: () => void): void {
    if (trails.length === 0) {
      if (ondone) ondone();
      return;
    }
    this._trailTagStore.deleteIf('delete multiple trails', trailTag => trails.some(t => t.owner === trailTag.owner && t.uuid === trailTag.trailUuid), ondone);
  }

  public deleteAllTagsFromCollections(collections: TrailCollection[], progress: Progress | undefined, progressWork: number): Observable<any> {
    return this._tagStore.getAll$().pipe(
      first(),
      switchMap(tags$ => tags$.length === 0 ? of([]) : zip(tags$.map(tag$ => tag$.pipe(firstTimeout(t => !!t, 1000, () => null as Tag | null))))),
      switchMap(tags => {
        const toRemove = tags.filter(tag => !!tag && collections.some(c => tag.collectionUuid === c.uuid && tag.owner === c.getContentOwner())) as Tag[];
        if (toRemove.length === 0) {
          progress?.addWorkDone(progressWork)
          return of(true);
        }
        return new Observable(observer => {
          this.deleteMany(toRemove, () => {
            progress?.addWorkDone(progressWork);
            observer.next(true);
            observer.complete();
          });
        });
      })
    );
  }

  public getTrailTags$(owner: string, trailUuid: string): Observable<TrailTag[]> {
    return this._trailTagStore.getAll$().pipe(
      collection$items(trailTag => trailTag.trailUuid === trailUuid && trailTag.owner === owner)
    );
  }

  public getTrailTagsWhenLoaded$(owner: string, trailUuid: string): Observable<TrailTag[]> {
    return this._trailTagStore.getAllWhenLoaded$().pipe(
      collection$items(trailTag => trailTag.trailUuid === trailUuid && trailTag.owner === owner)
    );
  }

  public getAllTrailsTags$(): Observable<Observable<TrailTag | null>[]> {
    return this._trailTagStore.getAll$();
  }

  public getAllTrailTagsWhenLoaded$(): Observable<TrailTag[]> {
    return this._trailTagStore.getAllWhenLoaded$().pipe(
      collection$items(),
    );
  }

  public addTrailTag(owner: string, trailUuid: string, tagUuid: string, ondone?: () => void) {
    if (!owner.startsWith(SHARED_OWNER_PREFIX) && !this.injector.get(QuotaService).checkQuota(q => q.trailTagsUsed + this._trailTagStore.getNbLocalCreates() >= q.trailTagsMax, 'trails_tags'))
      return;
    this._trailTagStore.create(new TrailTag({owner, trailUuid, tagUuid}), ondone);
  }

  public addTrailTags(owner: string, trailTags: {trailUuid: string, tagUuid: string}[], ondone?: () => void) {
    if (!owner.startsWith(SHARED_OWNER_PREFIX) && !this.injector.get(QuotaService).checkQuota(q => q.trailTagsUsed + this._trailTagStore.getNbLocalCreates() + trailTags.length > q.trailTagsMax, 'trails_tags'))
      return;
    this._trailTagStore.createMany(trailTags.map(t => new TrailTag({owner, trailUuid: t.trailUuid, tagUuid: t.tagUuid})), ondone);
  }

  public deleteTrailTag(owner: string, trailUuid: string, tagUuid: string) {
    this._trailTagStore.delete(new TrailTag({owner, trailUuid, tagUuid}));
  }

  public deleteManyTrailTag(owner: string, toDelete: {trailUuid: string, tagUuid: string}[]) {
    this._trailTagStore.deleteIf('Delete ' + toDelete.length + ' trail tags', item => toDelete.some(t => owner === item.owner && t.trailUuid === item.trailUuid && t.tagUuid === item.tagUuid));
  }

  public getTagNames$(owner: string, tagUuid: string, firstReady: boolean = false): Observable<string[]> {
    const result$ = this.getTag$(owner, tagUuid).pipe(
      switchMap(tag => {
        if (!tag) return firstReady ? EMPTY : of(['']);
        const name = tag.name;
        const parent = tag.parentUuid;
        if (!parent) return of([name]);
        return this.getTagNames$(owner, parent, firstReady).pipe(
          map(parentNames => [...parentNames, name])
        );
      })
    );
    if (firstReady) return result$.pipe(firstTimeout(() => true, 5000, () => [] as string[]));
    return result$;
  }

  public getTagsNames$(owner: string, tagsUuids: string[]): Observable<string[][]> {
    if (tagsUuids.length === 0) return of([]);
    return combineLatest(tagsUuids.map(uuid => this.getTagNames$(owner, uuid)));
  }

  public getTagsFullnames$(owner: string, tagsUuids: string[]): Observable<string[]> {
    return this.getTagsNames$(owner, tagsUuids).pipe(
      map(tagsNames => tagsNames.map(names => names.join('/')))
    );
  }

  public getTrailTagsNames$(owner: string, trailUuid: string, firstReady: boolean = false): Observable<string[][]> {
    const result$ = this.getTrailTags$(owner, trailUuid).pipe(
      switchMap(trailTags => {
        if (trailTags.length === 0) return of([]);
        return combineLatest(trailTags.map(trailTag => this.getTagNames$(owner, trailTag.tagUuid, firstReady)));
      })
    );
    if (firstReady) return result$.pipe(first());
    return result$;
  }

  public getTrailTagsFullNames$(owner: string, trailUuid: string): Observable<string[]> {
    return this.getTrailTagsNames$(owner, trailUuid).pipe(
      map(list => list.map(names => names.join('/')))
    );
  }

  public get storeLoaded$() { return combineLatest([this._tagStore.isLoaded$, this._trailTagStore.isLoaded$]).pipe(filter(loaded => loaded.every(Boolean))); }

}

class TagStore extends OwnedStore<TagDto, Tag> implements StoreWithCleaning {

  constructor(
    injector: Injector,
    private readonly http: HttpService,
    private readonly collectionService: TrailCollectionService,
  ) {
    super(injector.get(CommonDatabaseService).tagTable, injector);
    this.quotaService = injector.get(QuotaService);
  }

  private readonly quotaService: QuotaService;

  protected override fromDTO(dto: TagDto): Tag {
    return new Tag(dto);
  }

  protected override toDTO(entity: Tag): TagDto {
    return entity.toDto();
  }

  protected override isQuotaReached(): boolean {
    const q = this.quotaService.quotas;
    return !q || q.tagsUsed >= q.tagsMax;
  }

  protected override readyToSave(entity: Tag): boolean {
    if (entity.parentUuid && !this.getItem(entity.parentUuid, entity.owner)?.isSavedOnServerAndNotDeletedLocally()) return false;
    const email = entity.owner.startsWith(SHARED_OWNER_PREFIX) ? this.injector.get(AuthService).email : entity.owner;
    if (!email) return false;
    if (!this.collectionService.getCollection(entity.collectionUuid, email)?.isSavedOnServerAndNotDeletedLocally()) return false;
    return true;
  }

  protected override readyToSave$(entity: Tag): Observable<boolean> {
    const parentReady$ = entity.parentUuid ? this.getItem$(entity.parentUuid, entity.owner).pipe(map(tag => !!tag?.isSavedOnServerAndNotDeletedLocally())) : of(true);
    const owner$ = entity.owner.startsWith(SHARED_OWNER_PREFIX) ? this.injector.get(AuthService).userChanged$.pipe(map(auth => auth && !auth.isAnonymous ? auth.email : null)) : of(entity.owner);
    const collectionReady$ = owner$.pipe(
      switchMap(owner => owner ? this.collectionService.getCollection$(entity.collectionUuid, owner).pipe(map(col => !!col?.isSavedOnServerAndNotDeletedLocally())) : of(false)),
    );
    return combineLatest([parentReady$, collectionReady$]).pipe(
      map(readiness => !readiness.includes(false))
    );
  }

  protected override createdLocallyCanBeRemoved(entity: Tag): Observable<boolean> {
    const owner$ = entity.owner.startsWith(SHARED_OWNER_PREFIX) ? this.injector.get(AuthService).userChanged$.pipe(map(auth => auth && !auth.isAnonymous ? auth.email : null)) : of(entity.owner);
    return owner$.pipe(
      switchMap(owner => owner ? this.collectionService.getCollection$(entity.collectionUuid, owner).pipe(map(c => !c)) : of(false)),
    );
  }

  protected override createOnServer(items: TagDto[]): Observable<TagDto[]> {
    return this.http.post<TagDto[]>(environment.apiBaseUrl + '/tag/v1/_bulkCreate', items).pipe(
      tap(created => this.quotaService.updateQuotas(q => q.tagsUsed += created.length)),
    );
  }

  protected override getUpdatesFromServer(knownItems: VersionedDto[]): Observable<UpdatesResponse<TagDto>> {
    return this.http.post<UpdatesResponse<TagDto>>(environment.apiBaseUrl + '/tag/v1/_bulkGetUpdates', knownItems);
  }

  protected override sendUpdatesToServer(items: TagDto[]): Observable<TagDto[]> {
    return this.http.put<TagDto[]>(environment.apiBaseUrl + '/tag/v1/_bulkUpdate', items);
  }

  protected override deleteFromServer(owner: string, uuids: string[]): Observable<void> {
    return this.http.post<void>(environment.apiBaseUrl + '/tag/v1/_bulkDelete' + (owner.startsWith(SHARED_OWNER_PREFIX) ? '/' + encodeURIComponent(owner) : ''), uuids).pipe(
      tap({
        complete: () => this.quotaService.updateQuotas(q => q.tagsUsed -= uuids.length)
      })
    );
  }

  protected override signalDeleted(deleted: { uuid: string; owner: string; }[]): void {
    const owned = deleted.filter(item => !item.owner.startsWith(SHARED_OWNER_PREFIX));
    if (owned.length > 0)
      this.injector.get(ShareService).signalTagsDeleted(owned);
  }

  cleaningDependencies() { return []; }

  doCleaning(): Promise<string> {
    const status = this._storeLoaded$.value;
    if (!status) return Promise.resolve('not loaded');
    return firstValueFrom(zip([
      this.getAll$().pipe(collection$items()),
      this.collectionService.getMyCollectionsReady$(),
    ]).pipe(
      first(),
      switchMap(([tags, collections]) => {
        return new Observable<any>(subscriber => {
          if (!this.isStillValid(status)) {
            subscriber.next('database changed, cancelled');
            subscriber.complete();
            return;
          }
          const maxDate = Date.now() - 24 * 60 * 60 * 1000;
          let count = 0;
          const ondone = new CompositeOnDone(() => {
            subscriber.next('' + count);
            subscriber.complete();
          });
          for (const tag of tags) {
            if (tag.createdAt > maxDate || tag.updatedAt > maxDate) continue;
            if (tag.owner.startsWith(SHARED_OWNER_PREFIX)) {
              if (collections.some(c => c.type === TrailCollectionType.SHARED && c.getContentOwner() === tag.owner)) continue;
            } else {
              if (collections.some(c => c.owner === tag.owner && c.uuid === tag.collectionUuid)) continue; // NOSONAR
            }
            const d = ondone.add();
            this.getLocalUpdate(tag).then(date => {
              if (!this.isStillValid(status)) {
                d();
                return;
              }
              if (!date || date > maxDate) {
                d();
                return;
              }
              count++;
              this.delete(tag, d);
            });
          }
          ondone.start();
        });
      })
    ));
  }

}

class TrailTagStore extends SimpleStoreWithoutUpdate<TrailTagDto, TrailTag> implements StoreWithCleaning {

  constructor(
    injector: Injector,
    private readonly http: HttpService,
    private readonly tagService: TagService,
    private readonly trailService: TrailService,
    private readonly auth: AuthService,
  ) {
    super(injector.get(CommonDatabaseService).trailTagTable, injector);
    this.quotaService = injector.get(QuotaService);
  }

  private readonly quotaService: QuotaService;

  protected override isQuotaReached(): boolean {
    const q = this.quotaService.quotas;
    return !q || q.trailTagsUsed >= q.trailTagsMax;
  }

  protected override fromDTO(dto: TrailTagDto): TrailTag {
    if (!dto.owner) dto.owner = this.auth.email!; // backward compatible
    return new TrailTag(dto);
  }

  protected override toDTO(entity: TrailTag): TrailTagDto {
    return entity.toDto();
  }

  protected override getKey(entity: TrailTag): string {
    if (entity.owner.startsWith(SHARED_OWNER_PREFIX))
      return entity.owner + ' ' + entity.trailUuid + '_' + entity.tagUuid;
    return entity.trailUuid + '_' + entity.tagUuid;
  }

  protected override readyToSave(entity: TrailTag): boolean {
    if (!this.tagService.getTag(entity.owner, entity.tagUuid)?.isSavedOnServerAndNotDeletedLocally()) return false;
    if (!this.trailService.getTrail(entity.trailUuid, entity.owner)?.isSavedOnServerAndNotDeletedLocally()) return false;
    if (this.trailService.isUpdatedLocally(entity.owner, entity.trailUuid)) return false;
    return true;
  }

  protected override readyToSave$(entity: TrailTag): Observable<boolean> {
    const tagReady$ = this.tagService.getTag$(entity.owner, entity.tagUuid).pipe(map(tag => !!tag?.isSavedOnServerAndNotDeletedLocally()));
    const trailReady$ = this.trailService.getTrail$(entity.trailUuid, entity.owner).pipe(map(trail => {
      return !!trail?.isSavedOnServerAndNotDeletedLocally() && !this.trailService.isUpdatedLocally(trail.owner, trail.uuid);
    }));
    return combineLatest([tagReady$, trailReady$]).pipe(
      map(readiness => !readiness.includes(false))
    );
  }

  protected override createdLocallyCanBeRemoved(entity: TrailTag): Observable<boolean> {
    return combineLatest([
       this.tagService.getTag$(entity.owner, entity.tagUuid),
       this.trailService.getTrail$(entity.trailUuid, entity.owner)
    ]).pipe(map(([tag, trail]) => !tag || !trail));
  }

  protected override createOnServer(items: TrailTagDto[]): Observable<TrailTagDto[]> {
    return this.http.post<TrailTagDto[]>(environment.apiBaseUrl + '/tag/v1/trails/_bulkCreate', items).pipe(
      tap(created => {
        const owned = created.filter(e => !e.owner.startsWith(SHARED_OWNER_PREFIX));
        if (owned.length > 0)
          this.quotaService.updateQuotas(q => q.trailTagsUsed += owned.length);
      }),
    );
  }

  protected override deleteFromServer(items: TrailTagDto[]): Observable<void> {
    return this.http.post<void>(environment.apiBaseUrl + '/tag/v1/trails/_bulkDelete', items).pipe(
      tap({
        complete: () => {
          const owned = items.filter(i => !i.owner.startsWith(SHARED_OWNER_PREFIX)).length;
          if (owned > 0)
            this.quotaService.updateQuotas(q => q.trailTagsUsed -= owned);
        }
      })
    );
  }

  protected override getAllFromServer(): Observable<TrailTagDto[]> {
    return this.http.get<TrailTagDto[]>(environment.apiBaseUrl + '/tag/v1/trails');
  }

  cleaningDependencies(): string[] {
    return ['trails', 'tags']
  }

  doCleaning(): Promise<string> {
    const status = this._storeLoaded$.value;
    if (!status) return Promise.resolve('not loaded');
    return firstValueFrom(zip([
      this.getAll$().pipe(collection$items()),
      this.tagService.getAllTags$().pipe(collection$items()),
      this.trailService.getAll$().pipe(collection$items()),
    ]).pipe(
      first(),
      switchMap(([trailsTags, tags, trails]) => {
        return new Observable<string>(subscriber => {
          if (!this.isStillValid(status)) {
            subscriber.next('database changed, cancelled');
            subscriber.complete();
            return;
          }
          let count = 0;
          const ondone = new CompositeOnDone(() => {
            subscriber.next('' + count);
            subscriber.complete();
          });
          for (const trailTag of trailsTags) {
            if (tags.some(t => t.uuid === trailTag.tagUuid && t.owner === trailTag.owner) &&
                trails.some(t => t.uuid === trailTag.trailUuid && t.owner === trailTag.owner)) continue;
            count++;
            this.delete(trailTag, ondone.add());
          }
          ondone.start();
        });
      })
    ));
  }
}
