import { Injectable, Injector } from "@angular/core";
import { OwnedStore, UpdatesResponse } from "./owned-store";
import { TagDto } from "src/app/model/dto/tag";
import { Tag } from "src/app/model/tag";
import { TrailTagDto } from "src/app/model/dto/trail-tag";
import { TrailTag } from "src/app/model/trail-tag";
import { EMPTY, Observable, combineLatest, first, map, of, switchMap, tap, throwError, zip } from "rxjs";
import { HttpService } from "../http/http.service";
import { environment } from "src/environments/environment";
import { DatabaseService, TAG_TABLE_NAME, TRAIL_TAG_TABLE_NAME } from "./database.service";
import { TrailCollectionService } from "./trail-collection.service";
import { VersionedDto } from "src/app/model/dto/versioned";
import { TrailService } from "./trail.service";
import { AuthService } from "../auth/auth.service";
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { Progress } from '../progress/progress.service';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import Dexie from 'dexie';
import { CompositeOnDone } from 'src/app/utils/callback-utils';
import { Console } from 'src/app/utils/console';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { QuotaService } from '../auth/quota.service';
import { SimpleStoreWithoutUpdate } from './simple-store-without-update';
import { ShareService } from './share.service';

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

  public getTag$(uuid: string): Observable<Tag | null> {
    return this.auth.auth$.pipe(filterDefined(),switchMap(auth => this._tagStore.getItem$(uuid, auth.email)))
  }

  public getTag(uuid: string): Tag | null {
    return this._tagStore.getItem(uuid, this.auth.email!);
  }

  public create(tag: Tag, ondone?: () => void): Observable<Tag | null> {
    if (!this.injector.get(QuotaService).checkQuota(q => q.tagsUsed + this._tagStore.getNbLocalCreates() >= q.tagsMax, 'tags'))
      return throwError(() => new Error('quota reached'));
    return this._tagStore.create(tag, ondone);
  }

  public update(tag: Tag, updater: (tag: Tag) => void, ondone?: (tag: Tag) => void): void {
    this._tagStore.updateWithLock(tag, updater, ondone);
  }

  public delete(tag: Tag, ondone?: () => void): void {
    this._trailTagStore.deleteIf('delete single tag', trailTag => trailTag.tagUuid === tag.uuid, () => {
      this._tagStore.delete(tag, ondone);
    });
  }

  public deleteMany(tags: Tag[], ondone?: () => void): void {
    if (tags.length === 0) {
      if (ondone) ondone();
      return;
    }
    this._trailTagStore.deleteIf('delete multiple tags', trailTag => !!tags.find(t => trailTag.tagUuid === t.uuid), () => {
      this._tagStore.deleteIf('delete multiple tags', tag => !!tags.find(t => tag.uuid === t.uuid), ondone);
    });
  }

  public deleteTrailTagsForTrail(trailUuid: string, ondone?: () => void): void {
    this._trailTagStore.deleteIf('delete single trail', trailTag => trailTag.trailUuid === trailUuid, ondone);
  }

  public deleteTrailTagsForTrails(trailUuids: string[], ondone?: () => void): void {
    if (trailUuids.length === 0) {
      if (ondone) ondone();
      return;
    }
    this._trailTagStore.deleteIf('delete multiple trails', trailTag => !!trailUuids.find(u => u === trailTag.trailUuid), ondone);
  }

  public deleteAllTagsFromCollections(collections: {owner: string, uuid: string}[], progress: Progress | undefined, progressWork: number): Observable<any> {
    return this._tagStore.getAll$().pipe(
      first(),
      switchMap(tags$ => tags$.length === 0 ? of([]) : zip(tags$.map(tag$ => tag$.pipe(firstTimeout(t => !!t, 1000, () => null as Tag | null))))),
      switchMap(tags => {
        const toRemove = tags.filter(tag => !!tag && !!collections.find(c =>tag.collectionUuid === c.uuid && tag.owner === c.owner)) as Tag[];
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

  public getTrailTags$(trailUuid: string): Observable<TrailTag[]> {
    return this._trailTagStore.getAll$().pipe(
      collection$items(trailTag => trailTag.trailUuid === trailUuid)
    );
  }

  public getAllTrailsTags$(): Observable<Observable<TrailTag | null>[]> {
    return this._trailTagStore.getAll$();
  }

  public addTrailTag(trailUuid: string, tagUuid: string, ondone?: () => void) {
    if (!this.injector.get(QuotaService).checkQuota(q => q.trailTagsUsed + this._trailTagStore.getNbLocalCreates() >= q.trailTagsMax, 'trails_tags'))
      return;
    this._trailTagStore.create(new TrailTag({trailUuid, tagUuid}), ondone);
  }

  public addTrailTags(trailTags: {trailUuid: string, tagUuid: string}[], ondone?: () => void) {
    if (!this.injector.get(QuotaService).checkQuota(q => q.trailTagsUsed + this._trailTagStore.getNbLocalCreates() + trailTags.length > q.trailTagsMax, 'trails_tags'))
      return;
    this._trailTagStore.createMany(trailTags.map(t => new TrailTag({trailUuid: t.trailUuid, tagUuid: t.tagUuid})), ondone);
  }

  public deleteTrailTag(trailUuid: string, tagUuid: string) {
    this._trailTagStore.delete(new TrailTag({trailUuid, tagUuid}));
  }

  public getTagNames$(tagUuid: string, firstReady: boolean = false): Observable<string[]> {
    const result$ = this.getTag$(tagUuid).pipe(
      switchMap(tag => {
        if (!tag) return firstReady ? EMPTY : of(['']);
        const name = tag.name;
        const parent = tag.parentUuid;
        if (!parent) return of([name]);
        return this.getTagNames$(parent, firstReady).pipe(
          map(parentNames => [...parentNames, name])
        );
      })
    );
    if (firstReady) return result$.pipe(firstTimeout(() => true, 5000, () => [] as string[]));
    return result$;
  }

  public getTagsNames$(tagsUuids: string[]): Observable<string[][]> {
    if (tagsUuids.length === 0) return of([]);
    return combineLatest(tagsUuids.map(uuid => this.getTagNames$(uuid)));
  }

  public getTagsFullnames$(tagsUuids: string[]): Observable<string[]> {
    return this.getTagsNames$(tagsUuids).pipe(
      map(tagsNames => tagsNames.map(names => names.join('/')))
    );
  }

  public getTrailTagsNames$(trailUuid: string, firstReady: boolean = false): Observable<string[][]> {
    const result$ = this.getTrailTags$(trailUuid).pipe(
      switchMap(trailTags => {
        if (trailTags.length === 0) return of([]);
        return combineLatest(trailTags.map(trailTag => this.getTagNames$(trailTag.tagUuid, firstReady)));
      })
    );
    if (firstReady) return result$.pipe(first());
    return result$;
  }

  public getTrailTagsFullNames$(trailUuid: string): Observable<string[]> {
    return this.getTrailTagsNames$(trailUuid).pipe(
      map(list => list.map(names => names.join('/')))
    );
  }

  public cleanDatabase(db: Dexie, email: string): Observable<any> {
    return this._tagStore.cleanDatabase(db, email).pipe(
      switchMap(() => this._trailTagStore.cleanDatabase(db, email))
    );
  }

}

class TagStore extends OwnedStore<TagDto, Tag> {

  constructor(
    injector: Injector,
    private readonly http: HttpService,
    private readonly collectionService: TrailCollectionService,
  ) {
    super(TAG_TABLE_NAME, injector);
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

  protected override migrate(fromVersion: number, dbService: DatabaseService): Promise<number | undefined> {
    return Promise.resolve(undefined);
  }

  protected override readyToSave(entity: Tag): boolean {
    if (entity.parentUuid && !this.getItem(entity.parentUuid, entity.owner)?.isSavedOnServerAndNotDeletedLocally()) return false;
    if (!this.collectionService.getCollection(entity.collectionUuid, entity.owner)?.isSavedOnServerAndNotDeletedLocally()) return false;
    return true;
  }

  protected override readyToSave$(entity: Tag): Observable<boolean> {
    const parentReady$ = entity.parentUuid ? this.getItem$(entity.parentUuid, entity.owner).pipe(map(tag => !!tag?.isSavedOnServerAndNotDeletedLocally())) : of(true);
    const collectionReady$ = this.collectionService.getCollection$(entity.collectionUuid, entity.owner).pipe(map(col => !!col?.isSavedOnServerAndNotDeletedLocally()));
    return combineLatest([parentReady$, collectionReady$]).pipe(
      map(readiness => readiness.indexOf(false) < 0)
    );
  }

  protected override createdLocallyCanBeRemoved(entity: Tag): Observable<boolean> {
    return this.collectionService.getCollection$(entity.collectionUuid, entity.owner).pipe(map(c => !c));
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

  protected override deleteFromServer(uuids: string[]): Observable<void> {
    return this.http.post<void>(environment.apiBaseUrl + '/tag/v1/_bulkDelete', uuids).pipe(
      tap({
        complete: () => this.quotaService.updateQuotas(q => q.tagsUsed -= uuids.length)
      })
    );
  }

  protected override signalDeleted(deleted: { uuid: string; owner: string; }[]): void {
    this.injector.get(ShareService).signalTagsDeleted(deleted);
  }

  protected override doCleaning(email: string, db: Dexie): Observable<any> {
    return zip([
      this.getAll$().pipe(collection$items()),
      this.collectionService.getMyCollectionsReady$(),
    ]).pipe(
      first(),
      switchMap(([tags, collections]) => {
        return new Observable<any>(subscriber => {
          const dbService = this.injector.get(DatabaseService);
          if (db !== dbService.db?.db || email !== dbService.email) {
            subscriber.next(false);
            subscriber.complete();
            return;
          }
          const maxDate = Date.now() - 24 * 60 * 60 * 1000;
          let count = 0;
          const ondone = new CompositeOnDone(() => {
            Console.info('Tags database cleaned: ' + count + ' removed');
            subscriber.next(true);
            subscriber.complete();
          });
          for (const tag of tags) {
            if (tag.createdAt > maxDate || tag.updatedAt > maxDate) continue;
            const collection = collections.find(c => c.uuid === tag.collectionUuid && c.owner === email);
            if (collection) continue;
            const d = ondone.add();
            this.getLocalUpdate(tag).then(date => {
              if (db !== dbService.db?.db || email !== dbService.email) {
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
    );
  }

}

class TrailTagStore extends SimpleStoreWithoutUpdate<TrailTagDto, TrailTag> {

  constructor(
    injector: Injector,
    private readonly http: HttpService,
    private readonly tagService: TagService,
    private readonly trailService: TrailService,
    private readonly auth: AuthService,
  ) {
    super(TRAIL_TAG_TABLE_NAME, injector);
    this.quotaService = injector.get(QuotaService);
  }

  private readonly quotaService: QuotaService;

  protected override isQuotaReached(): boolean {
    const q = this.quotaService.quotas;
    return !q || q.trailTagsUsed >= q.trailTagsMax;
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

  protected override migrate(fromVersion: number, dbService: DatabaseService): Promise<number | undefined> {
    return Promise.resolve(undefined);
  }

  protected override readyToSave(entity: TrailTag): boolean {
    if (!this.tagService.getTag(entity.tagUuid)?.isSavedOnServerAndNotDeletedLocally()) return false;
    if (!this.trailService.getTrail(entity.trailUuid, this.auth.email!)?.isSavedOnServerAndNotDeletedLocally()) return false;
    if (this.trailService.isUpdatedLocally(this.auth.email!, entity.trailUuid)) return false;
    return true;
  }

  protected override readyToSave$(entity: TrailTag): Observable<boolean> {
    const tagReady$ = this.tagService.getTag$(entity.tagUuid).pipe(map(tag => !!tag?.isSavedOnServerAndNotDeletedLocally()));
    const trailReady$ = this.trailService.getTrail$(entity.trailUuid, this.auth.email!).pipe(map(trail => {
      return !!trail?.isSavedOnServerAndNotDeletedLocally() && !this.trailService.isUpdatedLocally(trail.owner, trail.uuid);
    }));
    return combineLatest([tagReady$, trailReady$]).pipe(
      map(readiness => readiness.indexOf(false) < 0)
    );
  }

  protected override createdLocallyCanBeRemoved(entity: TrailTag): Observable<boolean> {
    return combineLatest([
       this.tagService.getTag$(entity.tagUuid),
       this.trailService.getTrail$(entity.trailUuid, this.auth.email!)
    ]).pipe(map(([tag, trail]) => !tag || !trail));
  }

  protected override createOnServer(items: TrailTagDto[]): Observable<TrailTagDto[]> {
    return this.http.post<TrailTagDto[]>(environment.apiBaseUrl + '/tag/v1/trails/_bulkCreate', items).pipe(
      tap(created => this.quotaService.updateQuotas(q => q.trailTagsUsed += created.length)),
    );
  }

  protected override deleteFromServer(items: TrailTagDto[]): Observable<void> {
    return this.http.post<void>(environment.apiBaseUrl + '/tag/v1/trails/_bulkDelete', items).pipe(
      tap({
        complete: () => this.quotaService.updateQuotas(q => q.trailTagsUsed -= items.length)
      })
    );
  }

  protected override getAllFromServer(): Observable<TrailTagDto[]> {
    return this.http.get<TrailTagDto[]>(environment.apiBaseUrl + '/tag/v1/trails');
  }

  protected override doCleaning(email: string, db: Dexie): Observable<any> {
    return zip([
      this.getAll$().pipe(collection$items()),
      this.tagService.getAllTags$().pipe(collection$items()),
      this.trailService.getAll$().pipe(collection$items()),
    ]).pipe(
      first(),
      switchMap(([trailsTags, tags, trails]) => {
        return new Observable<any>(subscriber => {
          const dbService = this.injector.get(DatabaseService);
          if (db !== dbService.db?.db || email !== dbService.email) {
            subscriber.next(false);
            subscriber.complete();
            return;
          }
          let count = 0;
          const ondone = new CompositeOnDone(() => {
            Console.info('TrailTags database cleaned: ' + count + ' removed');
            subscriber.next(true);
            subscriber.complete();
          });
          for (const trailTag of trailsTags) {
            const tag = tags.find(t => t.uuid === trailTag.tagUuid);
            const trail = trails.find(t => t.uuid === trailTag.trailUuid && t.owner === email);
            if (tag && trail) continue;
            count++;
            this.delete(trailTag, ondone.add());
          }
          ondone.start();
        });
      })
    );
  }
}
