import { Injectable } from "@angular/core";
import { OwnedStore, UpdatesResponse } from "./owned-store";
import { TagDto } from "src/app/model/dto/tag";
import { Tag } from "src/app/model/tag";
import { SimpleStore } from "./simple-store";
import { TrailTagDto } from "src/app/model/dto/trail-tag";
import { TrailTag } from "src/app/model/trail-tag";
import { Observable, combineLatest, filter, map, mergeMap, of } from "rxjs";
import { HttpService } from "../http/http.service";
import { environment } from "src/environments/environment";
import { DatabaseService, TAG_TABLE_NAME, TRAIL_TAG_TABLE_NAME } from "./database.service";
import { NetworkService } from "../network/newtork.service";
import { TrailCollectionService } from "./trail-collection.service";
import { VersionedDto } from "src/app/model/dto/versioned";
import { TrailService } from "./trail.service";
import { AuthService } from "../auth/auth.service";

@Injectable({
    providedIn: 'root'
})
export class TagService {

    private _tagStore: TagStore;
    private _trailTagStore: TrailTagStore;

    constructor(
        databaseService: DatabaseService,
        network: NetworkService,
        http: HttpService,
        collectionService: TrailCollectionService,
        trailService: TrailService,
        private auth: AuthService,
      ) {
        this._tagStore = new TagStore(databaseService, network, http, collectionService);
        this._trailTagStore = new TrailTagStore(databaseService, network, http, this, trailService, auth);
      }
    
    public getAllTags$(filter: (tag: Tag) => boolean = () => true): Observable<Observable<Tag | null>[]> {
        return this._tagStore.getAll$(filter);
      }
    
      public getAllTagsForCollectionUuid$(collectionUuid: string): Observable<Observable<Tag | null>[]> {
        return this.getAllTags$(tag => tag.collectionUuid === collectionUuid);
      }
    
      public getTag$(uuid: string): Observable<Tag | null> {
        return this.auth.auth$.pipe(filter(auth => !!auth),mergeMap(auth => this._tagStore.getItem$(uuid, auth!.email)))
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
    
      public delete(tag: Tag): void {
        // TODO delete from trailTagStore
        this._tagStore.delete(tag);
      }
    
}

class TagStore extends OwnedStore<TagDto, Tag> {

    constructor(
        databaseService: DatabaseService,
        network: NetworkService,
        private http: HttpService,
        private collectionService: TrailCollectionService,
      ) {
        super(TAG_TABLE_NAME, databaseService, network);
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
        private http: HttpService,
        private tagService: TagService,
        private trailService: TrailService,
        private auth: AuthService,
    ) {
        super(TRAIL_TAG_TABLE_NAME, databaseService, network);
    }

    protected override fromDTO(dto: TrailTagDto): TrailTag {
        return new TrailTag(dto);
    }

    protected override toDTO(entity: TrailTag): TrailTagDto {
        return entity.toDto();
    }

    protected override areSame(dto: TrailTagDto, entity: TrailTag): boolean {
        return dto.tagUuid === entity.tagUuid && dto.trailUuid === entity.trailUuid;
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