import { Injector } from '@angular/core';
import { FetchSourcePlugin, TrailInfo } from './fetch-source.interfaces';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { SegmentDto } from 'src/app/model/dto/segment';
import { WayPointDto } from 'src/app/model/dto/way-point';
import { BehaviorSubject, firstValueFrom, map, Observable, of, switchMap } from 'rxjs';
import { Trail } from 'src/app/model/trail';
import { Track } from 'src/app/model/track';
import { PreferencesService } from '../preferences/preferences.service';
import { SimplifiedTrackSnapshot, TrackMetadataSnapshot } from 'src/app/model/snapshots';
import { TrackDatabase } from '../database/track-database';
import { PointDtoMapper } from 'src/app/model/point-dto-mapper';

export class LinkPlugin extends FetchSourcePlugin {

  public readonly name = 'link';
  public readonly owner = 'link';

  constructor(injector: Injector) {
    super(injector);
  }

  protected override listenAllowed(): void {
    this._allowed$.next(true);
  }
  protected override checkAllowed$(): Observable<boolean> {
    return of(true);
  }

  public readonly canFetchFromUrl = true;

  public override canFetchTrailInfoByUrl(url: string): boolean {
    return url.startsWith(environment.baseUrl + '/trail/link/');
  }

  public override fetchTrailInfoByUrl(url: string): Promise<TrailInfo | null> {
    const link = url.substring(environment.baseUrl.length + 12);
    return this.getInfo(link);
  }

  public override canFetchTrailByUrl(url: string): boolean {
    return url.startsWith(environment.baseUrl + '/trail/link/');
  }

  public override fetchTrailByUrl(url: string): Promise<Trail | null> {
    const link = url.substring(environment.baseUrl.length + 12);
    return this.getTrail(link);
  }

  public forceRefresh(uuid: string): Promise<Trail | null> {
    return this.toPromise(this.getLink(uuid, true).pipe(map(cache => this.toTrail(uuid, cache))));
  }

  public getTrails(uuids: string[]): Promise<Trail[]> {
    return Promise.all(uuids.map(uuid => this.getTrail(uuid))).then(result => result.filter(t => !!t));
  }

  public getMetadataList(uuids: string[]): Promise<TrackMetadataSnapshot[]> {
    return Promise.all(uuids.map(uuid => this.getMetadata(uuid))).then(result => result.filter(t => !!t));
  }

  public getTrail(uuid: string): Promise<Trail | null> {
    return this.toPromise(this.getLink(uuid, false).pipe(map(cache => this.toTrail(uuid, cache))));
  }

  public getFullTrack(uuid: string): Promise<Track | null> {
    return this.toPromise(this.getLink(uuid, false).pipe(map(cache => this.toTrack(uuid, cache))));
  }

  public getMetadata(uuid: string): Promise<TrackMetadataSnapshot | null> {
    return this.toPromise(this.getLink(uuid, false).pipe(map(cache => this.toMetadata(uuid, cache))));
  }

  public getSimplifiedTrack(uuid: string): Promise<SimplifiedTrackSnapshot | null> {
    return this.toPromise(this.getLink(uuid, false).pipe(map(cache => this.toSimplifiedTrack(uuid, cache))));
  }

  private toPromise<T>(observable: Observable<T>): Promise<T | null> {
    return firstValueFrom(observable);
  }

  private toTrail(link: string, cache: LinkCache): Trail {
    if (cache.trail) return cache.trail;
    return cache.trail = new Trail({
      ...cache.content.trail,
      version: 1,
      owner: this.owner,
      uuid: link,
      originalTrackUuid: link,
      currentTrackUuid: link,
      collectionUuid: 'link',
    });
  }

  private toTrack(link: string, cache: LinkCache): Track {
    if (cache.track) return cache.track;
    return cache.track = new Track({
      ...cache.content.track,
      version: 1,
      owner: this.owner,
      uuid: link,
    }, this.injector.get(PreferencesService));
  }

  private toMetadata(link: string, cache: LinkCache): TrackMetadataSnapshot {
    if (cache.metadata) return cache.metadata;
    return cache.metadata = TrackDatabase.toMetadata(this.toTrack(link, cache));
  }

  private toSimplifiedTrack(link: string, cache: LinkCache): SimplifiedTrackSnapshot {
    if (cache.simplified) return cache.simplified;
    return cache.simplified = TrackDatabase.simplify(this.toTrack(link, cache));
  }

  public getInfo(uuid: string): Promise<TrailInfo | null> {
    return this.toPromise(this.getLink(uuid, false).pipe(map(cache => this.toTrailInfo(uuid, cache))));
  }

  public getInfos(uuids: string[]): Promise<{uuid: string, info: TrailInfo}[]> {
    return Promise.all(uuids.map(u => this.getInfo(u).catch(e => null)))
    .then(results => {
      const r: {uuid: string, info: TrailInfo}[] = [];
      for (let i = 0; i < uuids.length; ++i)
        if (results[i]) r.push({uuid: uuids[i], info: results[i]!});
      return r;
    });
  }

  private toTrailInfo(link: string, cache: LinkCache): TrailInfo {
    if (cache.info) return cache.info;
    return cache.info = {
      photos: cache.content.photos.map(p => ({
        url: environment.apiBaseUrl + '/trail-link/v1/photo/' + link + '/' + p.uuid,
        description: p.description,
        pos: p.latitude !== undefined && p.longitude !== undefined ? {lat: PointDtoMapper.readCoordValue(p.latitude), lng: PointDtoMapper.readCoordValue(p.longitude)} : undefined,
        time: p.dateTaken,
      })),
    };
  }


  private readonly _loadedTrails = new Map<string, {content$: BehaviorSubject<LinkCache>, fetchDate: number}>();
  private readonly _loadingTrails = new Map<string, Observable<LinkCache>>();

  private getLink(link: string, force: boolean): Observable<LinkCache> {
    const loaded = this._loadedTrails.get(link);
    if (loaded) {
      if (loaded.fetchDate > Date.now() - 120000 && !force) return loaded.content$;
      this.loadLink(link);
      return loaded.content$;
    }
    return this.loadLink(link);
  }

  private loadLink(link: string): Observable<LinkCache> {
    const loading = this._loadingTrails.get(link);
    if (loading) return loading;
    const link$ = this.injector.get(HttpService).get<TrailLinkContent>(environment.apiBaseUrl + '/trail-link/v1/trail/' + link).pipe(
      switchMap(content => {
        const current = this._loadedTrails.get(link);
        if (current) {
          current.fetchDate = Date.now();
          current.content$.next({content});
          this._loadingTrails.delete(link);
          return current.content$;
        }
        const content$ = new BehaviorSubject<LinkCache>({content});
        this._loadedTrails.set(link, {content$, fetchDate: Date.now()});
        this._loadingTrails.delete(link);
        return content$;
      })
    );
    this._loadingTrails.set(link, link$);
    return link$;
  }

}

interface LinkCache {
  content: TrailLinkContent;
  trail?: Trail;
  track?: Track;
  metadata?: TrackMetadataSnapshot;
  simplified?: SimplifiedTrackSnapshot;
  info?: TrailInfo;
}

interface TrailLinkContent {
  trail: TrailLinkTrail;
  track: TrailLinkTrack;
  photos: TrailLinkPhoto[];
}

interface TrailLinkTrail {
  createdAt: number;
  updatedAt: number;

  name?: string;
  description?: string;
  location?: string;
  date?: number;
  loopType?: string;
  activity?: string;
}

interface TrailLinkTrack {
  s?: SegmentDto[];
  wp?: WayPointDto[];
}

interface TrailLinkPhoto {
  uuid: string;
  createdAt: number;
  updatedAt: number;

  description: string;
  dateTaken?: number;
  latitude?: number;
  longitude?: number;
  isCover: boolean;
  index: number;
}
