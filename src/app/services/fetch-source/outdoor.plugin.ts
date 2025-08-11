import { Injector } from '@angular/core';
import { PluginWithDb, TrailInfoBaseDto } from './abstract-plugin-with-db';
import { SearchResult, TrailInfo } from './fetch-source.interfaces';
import { Trail } from 'src/app/model/trail';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { catchError, firstValueFrom, from, map, merge, Observable, of, switchMap, zip } from 'rxjs';
import { filterItemsDefined } from 'src/app/utils/rxjs/filter-defined';
import * as L from 'leaflet';
import { Track } from 'src/app/model/track';
import { PreferencesService } from '../preferences/preferences.service';
import { Arrays } from 'src/app/utils/arrays';
import { TrailSourceType } from 'src/app/model/dto/trail';
import { Console } from 'src/app/utils/console';
import { TrackMetadataSnapshot } from 'src/app/model/snapshots';

interface TrailInfoDto extends TrailInfoBaseDto {
  id: string;
}

export class OutdoorPlugin extends PluginWithDb<TrailInfoDto> {

  constructor(
    injector: Injector,
  ) {
    super(injector, 'outdooractive', 'id', 'id');
  }

  public override readonly name = 'Outdoor Active';
  public override readonly owner = 'outdooractive';
  public override readonly canFetchFromUrl = true;

  protected override checkAllowed$(): Observable<boolean> {
    return this.injector.get(HttpService).get<boolean>(environment.apiBaseUrl + '/search-trails/v1/outdooractive/available').pipe(catchError(e => of(false)));
  }

  public override canFetchTrailInfoByUrl(url: string): boolean {
    return this.idFromUrl(url) !== undefined;
  }

  public override fetchTrailInfoByUrl(url: string): Promise<TrailInfo | null> {
    const id = this.idFromUrl(url);
    if (!id) return Promise.resolve(null);
    return this.tableInfos.get(id)
    .then(info => info ? info.info :
      firstValueFrom(this.requestTrailsByIds([id]))
      .then(result => result.length === 0 ? null : result[0].info)
    );
  }

  private idFromUrl(url: string): string | undefined {
    if (!url.startsWith('https://www.outdooractive.com/')) return undefined;
    url = url.substring('https://www.outdooractive.com'.length);
    if (url.indexOf('/route/') < 0 && url.indexOf('/track/') < 0 && url.indexOf('/routes/') < 0 && url.indexOf('/tracks/') < 0) return undefined;
    let i = url.indexOf('?');
    if (i > 0) url = url.substring(0, i);
    i = url.indexOf('#');
    if (i > 0) url = url.substring(0, i);
    if (url.endsWith('/')) url = url.substring(0, url.length - 1);
    url = url.substring(1);
    i = url.lastIndexOf('/');
    const id = url.substring(i + 1);
    if (isNaN(parseInt(id))) return undefined;
    return id;
  }

  public override canFetchTrailByUrl(url: string): boolean {
    return this.canFetchTrailInfoByUrl(url);
  }

  public override fetchTrailByUrl(url: string): Promise<Trail | null> {
    const id = this.idFromUrl(url);
    if (!id) {
      Console.info('Outdoor active: cannot determine ID from url: ', url);
      return Promise.resolve(null);
    }
    return this.tableTrails.get(id)
    .then(trail => trail ? new Trail(trail) :
      firstValueFrom(this.requestTrailsByIds([id]))
      .then(result => result.length === 0 ? null : result[0].trail)
    );
  }

  public override canSearchByArea(): boolean {
    return true;
  }

  public override searchByArea(bounds: L.LatLngBounds, limit: number): Observable<SearchResult> {
    return this.injector.get(HttpService).get<string[]>(
      environment.apiBaseUrl + '/search-trails/v1/outdooractive' +
      '?lat=' + bounds.getCenter().lat +
      '&lng=' + bounds.getCenter().lng +
      '&radius=' + Math.floor(Math.max(bounds.getNorthEast().distanceTo(bounds.getSouthEast()), bounds.getNorthEast().distanceTo(bounds.getNorthWest()))) +
      '&limit=' + limit
    ).pipe(
      switchMap(ids => from(this.tableMetadata.bulkGet(ids.map(id => id + '-original'))).pipe(
        switchMap(knowns => new Observable<SearchResult>(subscriber => {
          const valid = knowns.filter(meta => meta?.bounds && L.latLngBounds(meta.bounds).overlaps(bounds)) as TrackMetadataSnapshot[];
          const unknowns = filterItemsDefined(knowns.map((metadata, index) => metadata ? undefined : ids[index]));
          if (valid.length === 0 && unknowns.length === 0) {
            subscriber.next({trails: [], end: true, tooManyResults: false});
            subscriber.complete();
            return;
          }
          const trails$: Observable<Trail[]>[] = [];
          if (valid.length > 0) {
            trails$.push(from(
              this.tableTrails.bulkGet(valid.map(meta => meta.uuid.substring(0, meta.uuid.length - '-original'.length)))
              .then(list => filterItemsDefined(list).map(t => new Trail(t)))
            ));
          }
          if (unknowns.length > 0) {
            trails$.push(
              ...Arrays.chunk(unknowns, 5)
              .map(chunck => this.fetchTrailsByIds$(chunck, 5).pipe(
                map(result => result.filter(r => r.metadata.bounds && bounds.overlaps(r.metadata.bounds)).map(r => r.trail))
              ))
            );
          }
          let count = 0;
          merge(...trails$).subscribe(
            list => {
              const end = ++count === trails$.length;
              subscriber.next({trails: list, end, tooManyResults: ids.length >= limit});
              if (end) subscriber.complete();
            }
          );
        }))
      ))
    );
  }

  private fetchTrailsByIds$(ids: string[], chunkSize: number = 10): Observable<{trail: Trail, metadata: TrackMetadataSnapshot}[]> {
    if (ids.length === 0) return of([]);
    return zip(
      Arrays.chunk(ids, chunkSize).map(chunk =>
        this.requestTrailsByIds(chunk)
        .pipe(
          catchError(e => {
            if (chunkSize > 1)
              return this.fetchTrailsByIds$(chunk, 1);
            return of([]);
          })
        )
      )
    ).pipe(
      map(chunks => Arrays.flatMap(chunks, a => a))
    );
  }

  private requestTrailsByIds(ids: string[]): Observable<{trail: Trail, metadata: TrackMetadataSnapshot, info: TrailInfo}[]> {
    return this.injector.get(HttpService).post<OutdoorTrail[]>(
      environment.apiBaseUrl + '/search-trails/v1/outdooractive/trails?lang=' + this.injector.get(PreferencesService).preferences.lang,
      ids
    ).pipe(
      map(list => {
        const prepared = list.map(ot => {
          const trail = new Trail({
            owner: this.owner,
            uuid: ot.id,
            name: ot.title ?? undefined,
            description: ot.description ?? undefined,
            activity: ot.activity ?? undefined,
            originalTrackUuid: ot.id + '-original',
            currentTrackUuid: ot.id + '-original',
            collectionUuid: this.owner,
            sourceType: TrailSourceType.EXTERNAL,
            source: 'https://www.outdooractive.com/routes/' + ot.id,
            sourceDate: Date.now(),
          });
          const track = new Track({
            owner: this.owner,
            uuid: ot.id,
          }, this.injector.get(PreferencesService));
          const segment = track.newSegment();
          segment.appendMany(ot.points.map((p, index) => ({pos: { lat: p.lat, lng: p.lng }, ele: p.ele, time: p.time ?? (index === 0 ? ot.date ?? undefined : undefined) })));

          return this.prepareTrailToStore(trail, track, ot.id);
        });
        const infos = list.map(ot => {
          return {
            id: ot.id,
            fetchDate: Date.now(),
            info: {
              key: ot.id,
              externalUrl: 'https://www.outdooractive.com/routes/' + ot.id,
              photos: ot.photos?.map(p => ({
                url: 'https://img.oastatic.com/img2/' + p.id + '/800x800/variant.jpg',
                description: p.title,
                pos: p.point ? { lat: p.point.lat, lng: p.point.lng } : undefined,
                time: p.point?.time,
              })),
              rating: ot.rating ?? undefined,
            }
          } as TrailInfoDto;
        });
        this.storeTrails(prepared);
        this.tableInfos.bulkPut(infos);
        return infos.map((info, index) => ({trail: prepared[index].trail, metadata: prepared[index].currentMetadata ?? prepared[index].originalMetadata, info: info.info}));
      }),
      catchError(e => {
        Console.error('Error retrieving trails from Outdoor Active', e);
        return of([]);
      })
    );
  }

}

interface OutdoorTrail {
  id: string;
  title?: string | null;
  description?: string | null;
  date?: number | null;
  points: {lat: number, lng: number, ele?: number, time?: number}[];
  photos?: {id: string, title: string, point?: {lat: number, lng: number, ele?: number, time?: number}}[] | null;
  rating?: number | null;
  activity?: string;
}
