import { Injectable } from "@angular/core";
import { Observable, map, of } from "rxjs";
import { TrailCollection } from "src/app/model/trail-collection";
import { AbstractStore, UpdatesResponse } from "./abstract-store";
import { TrailCollectionDto } from "src/app/model/dto/trail-collection";
import { DatabaseService, TRAIL_COLLECTION_TABLE_NAME } from "./database.service";
import { Versioned } from "src/app/model/versioned";
import { environment } from "src/environments/environment";
import { HttpService } from "../http/http.service";
import { NetworkService } from "../network/newtork.service";
import { VersionedDto } from "src/app/model/dto/versioned";

@Injectable({
    providedIn: 'root'
})
export class TrailCollectionService {

    private _store: TrailCollectionStore;

    constructor(
      databaseService: DatabaseService,
      network: NetworkService,
      http: HttpService,
    ) {
        this._store = new TrailCollectionStore(databaseService, network, http);
    }

    public getAll$(): Observable<Observable<TrailCollection | null>[]> {
        return this._store.getAll$();
      }

      public getCollection$(uuid: string, owner: string): Observable<TrailCollection | null> {
        return this._store.getItem$(uuid, owner);
      }

      public getCollection(uuid: string, owner: string): TrailCollection | null {
        return this._store.getItem(uuid, owner);
      }

      public create(collection: TrailCollection): Observable<TrailCollection | null> {
        return this._store.create(collection);
      }

      public update(collection: TrailCollection): void {
        this._store.update(collection);
      }

      public delete(collection: TrailCollection): void {
        // TODO delete all trails
        this._store.delete(collection);
      }

}

class TrailCollectionStore extends AbstractStore<TrailCollectionDto, TrailCollection> {

    constructor(
      databaseService: DatabaseService,
      network: NetworkService,
      private http: HttpService,
    ) {
      super(TRAIL_COLLECTION_TABLE_NAME, databaseService, network);
    }

    protected override fromDTO(dto: TrailCollectionDto): TrailCollection {
      return new TrailCollection(dto);
    }

    protected override toDTO(entity: TrailCollection): TrailCollectionDto {
      return entity.toDto();
    }

    protected override readyToSave(entity: TrailCollection): boolean {
        return true;
    }

    protected override readyToSave$(entity: TrailCollection): Observable<boolean> {
      return of(true);
    }

    protected override createOnServer(items: TrailCollectionDto[]): Observable<TrailCollectionDto[]> {
      return this.http.post<TrailCollectionDto[]>(environment.apiBaseUrl + '/trail-collection/v1/_bulkCreate', items);
    }

    protected override getUpdatesFromServer(knownItems: VersionedDto[]): Observable<UpdatesResponse<TrailCollectionDto>> {
      return this.http.post<UpdatesResponse<TrailCollectionDto>>(environment.apiBaseUrl + '/trail-collection/v1/_bulkGetUpdates', knownItems);
    }

    protected override sendUpdatesToServer(items: TrailCollectionDto[]): Observable<TrailCollectionDto[]> {
      return this.http.put<TrailCollectionDto[]>(environment.apiBaseUrl + '/trail-collection/v1/_bulkUpdate', items);
    }

    protected override deleteFromServer(uuids: string[]): Observable<void> {
      return this.http.post<void>(environment.apiBaseUrl + '/trail-collection/v1/_bulkDelete', uuids);
    }

  }
