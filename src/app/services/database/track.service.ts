import { Injectable } from '@angular/core';
import { AbstractStore, UpdatesResponse } from './abstract-store';
import { TrackDto } from 'src/app/model/dto/track';
import { Track } from 'src/app/model/track';
import { DatabaseService, TRACK_TABLE_NAME } from './database.service';
import { HttpService } from '../http/http.service';
import { Observable, catchError, map, mergeMap, of, zip } from 'rxjs';
import { environment } from 'src/environments/environment';
import { NetworkService } from '../network/newtork.service';
import { RequestLimiter } from 'src/app/utils/request-limiter';
import { VersionedDto } from 'src/app/model/dto/versioned';

@Injectable({
  providedIn: 'root'
})
export class TrackService {

  private _store: TrackStore;

  constructor(
    databaseService: DatabaseService,
    network: NetworkService,
    http: HttpService,
  ) {
    this._store = new TrackStore(databaseService, network, http);
  }

  public getAll$(): Observable<Observable<Track | null>[]> {
    return this._store.getAll$();
  }

  public getTrack$(uuid: string, owner: string): Observable<Track | null> {
    return this._store.getItem$(uuid, owner);
  }

  public getTrack(uuid: string, owner: string): Track | null {
    return this._store.getItem(uuid, owner);
  }

  public create(track: Track): Observable<Track | null> {
    return this._store.create(track);
  }

  public update(track: Track): void {
    this._store.update(track);
  }

  public delete(track: Track): void {
    this._store.delete(track);
  }

  public deleteByUuidAndOwner(uuid: string, owner: string): void {
    const item = this._store.getItem(uuid, owner);
    if (item) {
      this.delete(item);
    }
  }

}

class TrackStore extends AbstractStore<TrackDto, Track> {

  constructor(
    databaseService: DatabaseService,
    network: NetworkService,
    private http: HttpService,
  ) {
    super(TRACK_TABLE_NAME, databaseService, network);
  }

  protected override fromDTO(dto: TrackDto): Track {
    return new Track(dto);
  }

  protected override toDTO(entity: Track): TrackDto {
    return entity.toDto();
  }

  protected override readyToSave(entity: Track): boolean {
    return true;
  }

  protected override readyToSave$(entity: Track): Observable<boolean> {
    return of(true);
  }

  protected override createOnServer(items: TrackDto[]): Observable<TrackDto[]> {
    const limiter = new RequestLimiter(2);
    const requests: Observable<TrackDto>[] = [];
    items.forEach(item => {
      const request = this.http.post<TrackDto>(environment.apiBaseUrl + '/track/v1', item);
      requests.push(limiter.add(request));
    });
    return zip(requests);
  }

  protected override getUpdatesFromServer(knownItems: VersionedDto[]): Observable<UpdatesResponse<TrackDto>> {
    return this.http.post<UpdatesResponse<{uuid: string, owner: string}>>(environment.apiBaseUrl + '/track/v1/_bulkGetUpdates', knownItems)
    .pipe(
      mergeMap(response => {
        const toRetrieve = [...response.created, ...response.updated];
        const limiter = new RequestLimiter(5);
        const requests = toRetrieve
          .map(item => this.http.get<TrackDto>(environment.apiBaseUrl + '/track/v1/' + encodeURIComponent(item.owner) + '/' + item.uuid))
          .map(request => limiter.add(request).pipe(catchError(error => {
            // TODO
            return of(null);
          })));
        return zip(requests).pipe(
          map(responses => {
            const finalResponse: UpdatesResponse<TrackDto> = { deleted: response.deleted, created: [], updated: [] };
            responses.forEach(track => {
              if (!track) return;
              if (response.updated.findIndex(value => value.uuid === track.uuid && value.owner === track.owner) >= 0)
                finalResponse.updated.push(track);
              else
                finalResponse.created.push(track);
            })
            return finalResponse;
          })
        )
      })
    );
  }

  protected override sendUpdatesToServer(items: TrackDto[]): Observable<TrackDto[]> {
    const limiter = new RequestLimiter(2);
    const requests: Observable<TrackDto>[] = [];
    items.forEach(item => {
      const request = this.http.put<TrackDto>(environment.apiBaseUrl + '/track/v1', item);
      requests.push(limiter.add(request));
    });
    return zip(requests);
  }

  protected override deleteFromServer(uuids: string[]): Observable<void> {
    return this.http.post<void>(environment.apiBaseUrl + '/track/v1/_bulkDelete', uuids);
  }

}
