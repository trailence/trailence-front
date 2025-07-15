import { Injector } from '@angular/core';
import { PluginWithDb, SimplifiedTrackDto, TrailInfoBaseDto } from './abstract-plugin-with-db';
import { catchError, combineLatest, defaultIfEmpty, firstValueFrom, from, map, Observable, of, switchMap } from 'rxjs';
import { SearchBubblesResult, SearchResult, TrailInfo } from './fetch-source.interfaces';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { Trail } from 'src/app/model/trail';
import { TrailDto, TrailSourceType } from 'src/app/model/dto/trail';
import { SimplifiedPoint, SimplifiedTrackSnapshot, TrackMetadataSnapshot } from '../database/track-database';
import { Console } from 'src/app/utils/console';
import { PointDtoMapper } from 'src/app/model/point';
import { Track } from 'src/app/model/track';
import { PreferencesService } from '../preferences/preferences.service';
import { SegmentDto } from 'src/app/model/dto/segment';
import { WayPointDto } from 'src/app/model/dto/way-point';
import { TrackDto } from 'src/app/model/dto/track';
import * as L from 'leaflet';
import { Filters } from 'src/app/components/trails-list/trails-list.component';
import { TypeUtils } from 'src/app/utils/type-utils';
import { PendingRequests, PendingRequestsMultiple } from 'src/app/utils/pending-requests';

interface TrailInfoDto extends TrailInfoBaseDto {
  uuid: string;
  slug: string;
}

export class TrailencePlugin extends PluginWithDb<TrailInfoDto> {

  public override readonly name = 'Trailence';
  public override readonly owner = 'trailence';
  public override readonly canFetchFromUrl = true;

  private readonly _pending = new PendingRequestsMultiple<Trail>((results: Trail[], key: string) => results.find(t => t.uuid === key) ?? null);
  private readonly _pendingFullTrack = new PendingRequests<Track>();

  constructor(
    injector: Injector,
  ) {
    super(injector, 'trailence_public', 'uuid, slug', 'uuid', true, 120000);
  }

  protected override checkAllowed$(): Observable<boolean> {
    return of(true);
  }

  public override canFetchTrailByUrl(url: string): boolean {
    return url.startsWith(environment.baseUrl);
  }

  public override canSearchByArea(): boolean { return true };

  public override searchByArea(bounds: L.LatLngBounds, limit: number): Observable<SearchResult> {
    return this.injector.get(HttpService).post<{uuids: string[], hasMoreResults: boolean}>(environment.apiBaseUrl + '/public/trails/v1/searchByBounds', {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      west: bounds.getWest(),
      east: bounds.getEast(),
      maxResults: limit,
    }).pipe(
      switchMap(searchResponse =>
        from(this.tableTrails.bulkGet(searchResponse.uuids)).pipe(
          switchMap(inDb => new Observable<SearchResult>(subscriber => {
            const toFetch: string[] = [];
            const ready: Trail[] = [];
            for (let i = 0; i < searchResponse.uuids.length; ++i) {
              const t = inDb[i];
              if (t) ready.push(new Trail(t)); else toFetch.push(searchResponse.uuids[i]);
            }
            if (toFetch.length === 0) {
              subscriber.next({trails: ready, end: true, tooManyResults: searchResponse.hasMoreResults});
              subscriber.complete();
              return;
            }
            if (ready.length > 0) {
              subscriber.next({trails: ready, end: false, tooManyResults: searchResponse.hasMoreResults});
            }
            const nextItems = (startIndex: number) => {
              const bunch = toFetch.length - startIndex <= 25 ? toFetch.slice(startIndex) : toFetch.slice(startIndex, startIndex + 25);
              this.fetchTrailsByIds(bunch).then(trails => {
                subscriber.next({trails, end: startIndex + bunch.length >= toFetch.length, tooManyResults: searchResponse.hasMoreResults});
                if (startIndex + bunch.length >= toFetch.length) {
                  subscriber.complete();
                } else {
                  nextItems(startIndex + bunch.length);
                }
              });
            };
            nextItems(0);
          }))
        )
      )
    );
  }

  protected override fetchTrailsByIds(uuids: string[]): Promise<Trail[]> {
    return this._pending.requestMultiple(uuids, (keys) =>
      firstValueFrom(
        this.injector.get(HttpService).post<PublicTrail[]>(environment.apiBaseUrl + '/public/trails/v1/trailsByIds', uuids)
      .pipe(
        switchMap(result => {
          if (result.length === 0) return of([]);
          const trailDtos: TrailDto[] = [];
          const metadataDtos: TrackMetadataSnapshot[] = [];
          const simplifiedTrackDtos: SimplifiedTrackDto[] = [];
          const infoDtos: TrailInfoDto[] = [];
          result.forEach(pt => {
            const dtos = this.publicTrailToDtos(pt);
            trailDtos.push(dtos.trailDto);
            metadataDtos.push(dtos.metadataDto);
            simplifiedTrackDtos.push(dtos.simplifiedTrackDto);
            infoDtos.push(dtos.infoDto);
          });
          return from(Promise.all([
            this.tableTrails.bulkPut(trailDtos),
            this.tableMetadata.bulkPut(metadataDtos),
            this.tableSimplifiedTracks.bulkPut(simplifiedTrackDtos),
            this.tableInfos.bulkPut(infoDtos),
          ])).pipe(map(() => trailDtos.map(t => new Trail(t))));
        }),
        catchError(e => {
          Console.error('Error fetching public trails', uuids, e);
          // try by smaller bunches
          if (uuids.length < 2) return of([]);
          const middle = uuids.length / 2;
          const bunch1 = uuids.slice(0, middle);
          const bunch2 = uuids.slice(middle);
          return combineLatest([
            this.fetchTrailsByIds(bunch1),
            this.fetchTrailsByIds(bunch2),
          ]).pipe(map(([t1,t2]) => [...t1, ...t2]));
        }),
      )
    ));
  }

  private publicTrailToDtos(pt: PublicTrail): {trailDto: TrailDto, metadataDto: TrackMetadataSnapshot, simplifiedTrackDto: SimplifiedTrackDto, infoDto: TrailInfoDto} {
    const simplifiedPoints: SimplifiedPoint[] = [];
    for (let i = 0; i < pt.simplifiedPath.length; i += 2) {
      simplifiedPoints.push({lat: pt.simplifiedPath[i], lng: pt.simplifiedPath[i + 1]});
    }
    const url = environment.baseUrl + '/trail/trailence/' + pt.slug;
    const nbRates = pt.nbRate0 + pt.nbRate1 + pt.nbRate2 + pt.nbRate3 + pt.nbRate4 + pt.nbRate5;
    const rating = nbRates > 0 ? (pt.nbRate1 + (pt.nbRate2 * 2) + (pt.nbRate3 * 3) + (pt.nbRate4 * 4) + (pt.nbRate5 * 5)) / nbRates : undefined;
    return {
      trailDto: {
        owner: 'trailence',
        uuid: pt.uuid,
        version: 1,
        createdAt: pt.createdAt,
        updatedAt: pt.updatedAt,

        name: pt.name,
        description: pt.description,
        location: pt.location,
        date: pt.date,
        loopType: pt.loopType,
        activity: pt.activity,

        originalTrackUuid: pt.uuid,
        currentTrackUuid: pt.uuid,
        collectionUuid: 'trailence',

        sourceType: TrailSourceType.EXTERNAL,
        source: url,
        sourceDate: Date.now(),
      },
      metadataDto: {
        owner: 'trailence',
        uuid: pt.uuid,
        createdAt: pt.createdAt,
        updatedAt: pt.updatedAt,

        distance: pt.distance,
        positiveElevation: pt.positiveElevation,
        negativeElevation: pt.negativeElevation,
        highestAltitude: pt.highestAltitude,
        lowestAltitude: pt.lowestAltitude,
        duration: pt.duration,
        startDate: pt.date,
        bounds: [[pt.boundsNorth, pt.boundsEast], [pt.boundsSouth, pt.boundsWest]],
        breaksDuration: pt.breaksDuration,
        estimatedDuration: pt.estimatedDuration,
        localUpdate: 0,
      },
      simplifiedTrackDto: {
        uuid: pt.uuid,
        points: simplifiedPoints,
      },
      infoDto: {
        fetchDate: Date.now(),
        uuid: pt.uuid,
        slug: pt.slug,
        info: {
          externalUrl: url,
          photos: pt.photos.sort((p1, p2) => p1.index - p2.index).map(p => ({
            description: p.description,
            time: p.date,
            pos: p.latitude && p.longitude ? {lat: PointDtoMapper.readCoordValue(p.latitude), lng: PointDtoMapper.readCoordValue(p.longitude)} : undefined,
            url: environment.apiBaseUrl + '/public/trails/v1/photo/' + pt.uuid + '/' + p.uuid,
          })),
          author: pt.authorAlias,
          myUuid: pt.myUuid ?? undefined,
          itsMine: pt.itsMine ?? undefined,
          nbRate0: pt.nbRate0,
          nbRate1: pt.nbRate1,
          nbRate2: pt.nbRate2,
          nbRate3: pt.nbRate3,
          nbRate4: pt.nbRate4,
          nbRate5: pt.nbRate5,
          nbRates,
          rating: rating,
          lang: pt.lang ?? undefined,
          nameTranslations: pt.nameTranslations ?? undefined,
          descriptionTranslations: pt.descriptionTranslations ?? undefined,
        }
      }
    };
  }

  protected override fetchTrailById(uuid: string): Promise<Trail | null> {
    if (!TypeUtils.isUuid(uuid)) {
      // we may have the slug locally
      return this.tableInfos.getBy('slug', uuid).then(info => {
        if (info) return this.getTrail(info.uuid);
        return this._pending.requestSingle(uuid, () => firstValueFrom(
          this.injector.get(HttpService).get<PublicTrail>(environment.apiBaseUrl + '/public/trails/v1/trailBySlug/' + uuid).pipe(
            switchMap(pt => {
              const dtos = this.publicTrailToDtos(pt);
              return from(Promise.all([
                this.tableTrails.put(dtos.trailDto),
                this.tableMetadata.put(dtos.metadataDto),
                this.tableSimplifiedTracks.put(dtos.simplifiedTrackDto),
                this.tableInfos.put(dtos.infoDto),
              ])).pipe(map(() => new Trail(dtos.trailDto)));
            }),
            catchError(e => {
              Console.error('Error getting public trail from slug', uuid, e);
              return of(null);
            }),
            defaultIfEmpty(null),
          )
        ));
      });
    }
    return this._pending.requestSingle(uuid, () => firstValueFrom(
      this.injector.get(HttpService).get<PublicTrail>(environment.apiBaseUrl + '/public/trails/v1/trailById/' + uuid).pipe(
        switchMap(pt => {
          const dtos = this.publicTrailToDtos(pt);
          return from(Promise.all([
            this.tableTrails.put(dtos.trailDto),
            this.tableMetadata.put(dtos.metadataDto),
            this.tableSimplifiedTracks.put(dtos.simplifiedTrackDto),
            this.tableInfos.put(dtos.infoDto),
          ])).pipe(map(() => new Trail(dtos.trailDto)));
        }),
        catchError(e => {
          Console.error('Error getting public trail from uuid', uuid, e);
          return of(null);
        }),
        defaultIfEmpty(null),
      )
    ));
  }

  protected override fetchMetadataById(uuid: string): Promise<TrackMetadataSnapshot | null> {
    return this.fetchTrailById(uuid).then(t => {
      if (!t) return null;
      return this.getMetadata(t.uuid);
    });
  }

  protected override fetchSimplifiedTrackById(uuid: string): Promise<SimplifiedTrackSnapshot | null> {
    return this.fetchTrailById(uuid).then(t => {
      if (!t) return null;
      return this.getSimplifiedTrack(t.uuid);
    });
  }

  protected override fetchInfoById(uuid: string): Promise<TrailInfo | null> {
    return this.fetchTrailById(uuid).then(t => {
      if (!t) return null;
      return this.getInfo(t.uuid);
    });
  }

  protected override fetchFullTrackById(uuid: string): Promise<Track | null> {
    return this._pendingFullTrack.request(uuid, () =>
      firstValueFrom(this.injector.get(HttpService).get<PublicTrack>(environment.apiBaseUrl + '/public/trails/v1/track/' + uuid))
      .then(pt => {
        const dto: TrackDto = {
          ...pt,
          owner: 'trailence',
          uuid: uuid,
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        this.tableFullTracks.put(dto);
        return new Track(dto, this.injector.get(PreferencesService));
      })
    );
  }

  public override canSearchBubbles(): boolean {
    return true;
  }

  public override searchBubbles(bounds: L.LatLngBounds, zoom: number, filters: Filters): Observable<SearchBubblesResult[]> {
    const topLeft = L.CRS.EPSG3857.latLngToPoint(bounds.getNorthWest(), zoom);
    const bottomRight = L.CRS.EPSG3857.latLngToPoint(bounds.getSouthEast(), zoom);
    const startY = Math.floor(topLeft.y / 128);
    const endY = Math.floor(bottomRight.y / 128);
    const startX = Math.floor(topLeft.x / 128);
    const endX = Math.floor(bottomRight.x / 128);
    const nbTilesByY = (4 << zoom);
    const tiles: number[] = [];
    for (let y = startY; y <= endY; y++)
      for (let x = startX; x <= endX; x++)
        tiles.push(y * nbTilesByY + x);
    const searchFilters = {
      duration: filters.duration,
      estimatedDuration: filters.estimatedDuration,
      distance: filters.distance,
      positiveElevation: filters.positiveElevation,
      negativeElevation: filters.negativeElevation,
      loopTypes: filters.loopTypes.selected,
      activities: filters.activities.selected,
    };
    return this.injector.get(HttpService).post<{trailsByTile: {tile: number, nbTrails: number}[]}>(environment.apiBaseUrl + '/public/trails/v1/countByTile', {zoom, tiles, filters: searchFilters}).pipe(
      map(result => result.trailsByTile.map(r => ({
        pos: L.CRS.EPSG3857.pointToLatLng(L.point((r.tile % nbTilesByY) * 128 + 64, Math.floor(r.tile / nbTilesByY) * 128 + 64), zoom),
        count: r.nbTrails,
      })))
    );
  }

}

interface PublicTrail {
  uuid: string;
  slug: string;
  createdAt: number;
  updatedAt: number;
  authorAlias?: string;
  myUuid?: string;
  itsMine?: boolean;

  name: string;
  description: string;
  location: string;
  date: number;

  distance: number;
  positiveElevation?: number;
  negativeElevation?: number;
  highestAltitude?: number;
  lowestAltitude?: number;
  duration?: number;
  breaksDuration: number;
  estimatedDuration: number;

  loopType: string;
  activity: string;

  boundsNorth: number;
  boundsSouth: number;
  boundsWest: number;
  boundsEast: number;

  nbRate0: number;
  nbRate1: number;
  nbRate2: number;
  nbRate3: number;
  nbRate4: number;
  nbRate5: number;

  simplifiedPath: number[];
  photos: PublicPhoto[];

  lang: string;
  nameTranslations?: {[key: string]: string};
  descriptionTranslations?: {[key: string]: string};
}

interface PublicPhoto {
  uuid: string;
  description: string;
  date?: number;
  latitude?: number;
  longitude?: number;
  index: number;
}

interface PublicTrack {
  s: SegmentDto[];
  wp: WayPointDto[];
}
