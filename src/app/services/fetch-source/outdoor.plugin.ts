import { Injector } from '@angular/core';
import { PluginWithDb, TrailInfoBaseDto } from './abstract-plugin-with-db';
import { TrailInfo } from './fetch-source.interfaces';
import { Trail } from 'src/app/model/trail';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { catchError, firstValueFrom, from, map, Observable, of, switchMap, zip } from 'rxjs';
import { filterItemsDefined } from 'src/app/utils/rxjs/filter-defined';
import L from 'leaflet';
import { TrackDatabase, TrackMetadataSnapshot } from '../database/track-database';
import { I18nService } from '../i18n/i18n.service';
import { Track } from 'src/app/model/track';
import { PreferencesService } from '../preferences/preferences.service';
import { TrackEditionService } from '../track-edition/track-edition.service';
import { Arrays } from 'src/app/utils/arrays';

interface TrailInfoDto extends TrailInfoBaseDto {
  id: string;
}

export class OutdoorPlugin extends PluginWithDb<TrailInfoDto> {

  constructor(
    injector: Injector,
  ) {
    super(injector, 'outdooractive', 'id');
  }

  public override readonly name = 'Outdoor Active';
  public override readonly owner = 'outdooractive';

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
    url = url.substring('https://www.outdooractive.com/'.length);
    if (url.indexOf('/route/') < 0 && url.indexOf('/track/') < 0) return undefined;
    let i = url.indexOf('?');
    if (i > 0) url = url.substring(0, i);
    i = url.indexOf('#');
    if (i > 0) url = url.substring(0, i);
    if (url.endsWith('/')) url = url.substring(0, url.length - 1);
    i = url.lastIndexOf('/');
    const id = url.substring(i + 1);
    if (isNaN(parseInt(id))) return undefined;
    return id;
  }

  public override canFetchTrailInfoByContent(html: Document): boolean {
    return false;
  }

  public override fetchTrailInfoByContent(html: Document): Promise<TrailInfo | null> {
    return Promise.resolve(null);
  }

  public override canFetchTrailByUrl(url: string): boolean {
    return this.canFetchTrailInfoByUrl(url);
  }

  public override fetchTrailByUrl(url: string): Promise<Trail | null> {
    const id = this.idFromUrl(url);
    if (!id) return Promise.resolve(null);
    return this.tableTrails.get(id)
    .then(trail => trail ? new Trail(trail) :
      firstValueFrom(this.requestTrailsByIds([id]))
      .then(result => result.length === 0 ? null : result[0].trail)
    );
  }

  public override canFetchTrailByContent(html: Document): boolean {
    return false;
  }

  public override fetchTrailByContent(html: Document): Promise<Trail | null> {
    return Promise.resolve(null);
  }

  public override canFetchTrailsByUrl(url: string): boolean {
    return false;
  }

  public override fetchTrailsByUrl(url: string): Promise<Trail[]> {
    return Promise.resolve([]);
  }

  public override canFetchTrailsByContent(html: Document): boolean {
    return false;
  }

  public override fetchTrailsByContent(html: Document): Promise<Trail[]> {
    return Promise.resolve([]);
  }

  public override canSearchByArea(): boolean {
    return true;
  }

  public override searchByArea(bounds: L.LatLngBounds): Promise<{ trails: Trail[]; tooMuchResults: boolean; }> {
    return firstValueFrom(this.injector.get(HttpService).get<string[]>(
      environment.apiBaseUrl + '/search-trails/v1/outdooractive' +
      '?lat=' + bounds.getCenter().lat +
      '&lng=' + bounds.getCenter().lng +
      '&radius=' + Math.floor(Math.max(bounds.getNorthEast().distanceTo(bounds.getSouthEast()), bounds.getNorthEast().distanceTo(bounds.getNorthWest()))) +
      '&limit=' + 200
    ).pipe(
      switchMap(ids => from(this.tableMetadata.bulkGet(ids.map(id => id + '-original'))).pipe(
        switchMap(knowns => {
          const valid = knowns.filter(meta => meta?.bounds && L.latLngBounds(meta.bounds).overlaps(bounds)) as TrackMetadataSnapshot[];
          const unknowns = filterItemsDefined(knowns.map((metadata, index) => metadata ? undefined : ids[index]));
          return zip(
            this.fetchTrailsByIds(unknowns),
            valid.length === 0 ? of([]) : from(
              this.tableTrails.bulkGet(valid.map(meta => meta.uuid.substring(0, meta.uuid.length - '-original'.length)))
              .then(list => filterItemsDefined(list).map(t => new Trail(t)))
            ),
          ).pipe(
            map(([list1, list2]) => {
              const fetched = list1.filter(t => t.metadata.bounds && bounds.overlaps(t.metadata.bounds)).map(t => t.trail);
              const trails = [...fetched, ...list2];
              return { trails, tooMuchResults: ids.length === 200 };
            })
          );
        })
      )),
    ));
  }

  private fetchTrailsByIds(ids: string[], chunkSize: number = 10): Observable<{trail: Trail, metadata: TrackMetadataSnapshot}[]> {
    if (ids.length === 0) return of([]);
    return zip(
      Arrays.chunk(ids, chunkSize).map(chunk =>
        this.requestTrailsByIds(chunk)
        .pipe(
          catchError(e => {
            if (chunkSize > 1)
              return this.fetchTrailsByIds(chunk, 1);
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
      environment.apiBaseUrl + '/search-trails/v1/outdooractive/trails?lang=' + this.injector.get(I18nService).textsLanguage,
      ids
    ).pipe(
      map(list => list.map(ot => {
        const trail = new Trail({
          owner: this.owner,
          uuid: ot.id,
          name: ot.title,
          description: ot.description,
          originalTrackUuid: ot.id + '-original',
          currentTrackUuid: ot.id + '-improved',
          collectionUuid: this.owner,
        });
        const track = new Track({
          owner: this.owner,
          uuid: ot.id + '-original',
        }, this.injector.get(PreferencesService));
        const segment = track.newSegment();
        segment.appendMany(ot.points.map((p, index) => ({pos: { lat: p.lat, lng: p.lng }, ele: p.ele, time: p.time ?? (index === 0 ? ot.date : undefined) })));

        const improved = this.injector.get(TrackEditionService).applyDefaultImprovments(track);
        this.injector.get(TrackEditionService).computeFinalMetadata(trail, improved);
        const trailDto = trail.toDto();
        const track1Dto = track.toDto();
        const track2Dto = improved.toDto();
        track2Dto.uuid = ot.id + '-improved';
        const metadata = TrackDatabase.toMetadata(improved);
        metadata.uuid = ot.id;
        const info = {
          key: ot.id,
          externalUrl: 'https://www.outdooractive.com/routes/' + ot.id,
          photos: ot.photos?.map(p => ({
            url: 'https://img.oastatic.com/img2/' + p.id + '/800x800/variant.jpg',
            description: p.title,
            pos: p.point ? { lat: p.point.lat, lng: p.point.lng } : undefined,
            time: p.point?.time,
          }))
        } as TrailInfo;
        this.tableInfos.put({id: ot.id, info, fetchDate: Date.now()}, ot.id);
        this.tableTrails.put(trailDto, ot.id);
        this.tableFullTracks.put(track1Dto, track1Dto.uuid);
        this.tableFullTracks.put(track2Dto, track2Dto.uuid);
        this.tableSimplifiedTracks.put({uuid: track1Dto.uuid, points: TrackDatabase.simplify(track).points}, track1Dto.uuid);
        this.tableSimplifiedTracks.put({uuid: track2Dto.uuid, points: TrackDatabase.simplify(improved).points}, track2Dto.uuid);
        this.tableMetadata.put({...TrackDatabase.toMetadata(track), uuid: track1Dto.uuid}, track1Dto.uuid);
        this.tableMetadata.put({...TrackDatabase.toMetadata(improved), uuid: track2Dto.uuid}, track2Dto.uuid);
        return {trail, metadata, info};
      }))
    );
  }

}

interface OutdoorTrail {
  id: string;
  title?: string;
  description?: string;
  date?: number;
  points: {lat: number, lng: number, ele?: number, time?: number}[];
  photos?: {id: string, title: string, point?: {lat: number, lng: number, ele?: number, time?: number}}[];
}
