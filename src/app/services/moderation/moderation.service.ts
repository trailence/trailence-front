import { Injectable, Injector } from '@angular/core';
import { HttpService } from '../http/http.service';
import { BehaviorSubject, combineLatest, defaultIfEmpty, from, map, Observable, of, switchMap, tap } from 'rxjs';
import { Trail } from 'src/app/model/trail';
import { TrailDto } from 'src/app/model/dto/trail';
import { environment } from 'src/environments/environment';
import { SimplifiedTrackSnapshot, TrackDatabase, TrackMetadataSnapshot } from '../database/track-database';
import { TrackDto } from 'src/app/model/dto/track';
import { Track } from 'src/app/model/track';
import { PreferencesService } from '../preferences/preferences.service';
import { CacheService, TimeoutCache, TimeoutCacheDb } from '../cache/cache.service';
import { PhotoDto } from 'src/app/model/dto/photo';
import { Photo } from 'src/app/model/photo';
import * as L from 'leaflet';
import { SegmentDto } from 'src/app/model/dto/segment';
import { WayPointDto } from 'src/app/model/dto/way-point';
import { calculateLongBreaksFromTrack } from '../track-edition/time/break-detection';
import { estimateTimeForTrack } from '../track-edition/time/time-estimation';
import { ProgressService } from '../progress/progress.service';
import { I18nService } from '../i18n/i18n.service';
import { ErrorService } from '../progress/error.service';
import { Console } from 'src/app/utils/console';
import { TrackUtils } from 'src/app/utils/track-utils';
import { TypeUtils } from 'src/app/utils/type-utils';

@Injectable({providedIn: 'root'})
export class ModerationService {

  private readonly trailCache: TimeoutCache<BehaviorSubject<{key: string, trail: Trail | null}>>;
  private readonly trackCache: TimeoutCache<Track>;
  private readonly trailAndPhotosCache: TimeoutCache<{trail: TrailDto, photos: PhotoDto[]}>;
  private readonly photoCache: TimeoutCache<BehaviorSubject<{key: string, photo: Photo | null}>>;
  private readonly photoBlobCache: TimeoutCacheDb<{photo_uuid: string, photo_owner: string, blob: Blob}>;

  constructor(
    private readonly http: HttpService,
    private readonly preferencesService: PreferencesService,
    cacheService: CacheService,
    private readonly injector: Injector,
  ) {
    this.trailCache = cacheService.createTimeoutCache(t => t.value.key, 60000);
    this.trackCache = cacheService.createTimeoutCache(t => t.uuid + ' ' + t.owner, 5 * 60 * 1000);
    this.trailAndPhotosCache = cacheService.createTimeoutCache(t => t.trail.uuid + ' ' + t.trail.owner, 90000);
    this.photoCache = cacheService.createTimeoutCache(t => t.value.key, 15 * 60 * 1000);
    this.photoBlobCache = cacheService.createTimeoutCacheDb('photo_blob', t => t.photo_uuid + ' ' + t.photo_owner, 15 * 60 * 1000);
  }

  public getTrailsToReview(): Observable<Observable<Trail | null>[]> {
    return this.http.get<{trail: TrailDto, photos: PhotoDto[]}[]>(environment.apiBaseUrl + '/moderation/v1/trailsToReview').pipe(
      tap(response => this.trailAndPhotosCache.feedList(response)),
      map(dtos => dtos.map(dto => {
        const trail = new Trail(dto.trail, true);
        let trail$ = this.trailCache.getItem(trail.uuid + ' ' + trail.owner);
        if (!trail$) {
          trail$ = new BehaviorSubject<{key: string, trail: Trail | null}>({key: trail.uuid + ' ' + trail.owner, trail: trail});
        } else {
          trail$.next({key: trail.uuid + ' ' + trail.owner, trail: trail});
        }
        return trail$.pipe(map(c => c.trail));
      })),
    );
  }

  public getTrail$(uuid: string, owner: string): Observable<Trail | null> {
    const c = this.trailCache.getItem(uuid + ' ' + owner);
    if (c) return c.pipe(map(t => t.trail));
    return this.http.get<{trail: TrailDto, photos: PhotoDto[]}>(environment.apiBaseUrl + '/moderation/v1/trailToReview/' + uuid + '/' + owner).pipe(
      switchMap(response => {
        this.trailAndPhotosCache.feedItem(response);
        const trail = new Trail(response.trail, true);
        const trail$ = new BehaviorSubject<{key: string, trail: Trail | null}>({key: trail.uuid + ' ' + trail.owner, trail: trail});
        this.trailCache.feedItem(trail$);
        return trail$.pipe(map(t => t.trail));
      }),
    );
  }

  public getPhotos$(owner: string, trailUuid: string): Observable<Photo[]> {
    const trailAndPhotos = this.trailAndPhotosCache.getItem(trailUuid + ' ' + owner);
    if (trailAndPhotos) {
      let result: Observable<Photo | null>[] = [];
      for (const p of trailAndPhotos.photos) {
        let c = this.photoCache.getItem(p.uuid + ' ' + p.owner);
        const photo = new Photo(p, true);
        if (c) {
          if (c.value.photo === null) c.next({key: p.uuid + ' ' + p.owner, photo});
        } else {
          c = new BehaviorSubject<{key: string, photo: Photo | null}>({key: p.uuid + ' ' + p.owner, photo});
        }
        this.photoCache.feedItem(c);
        result.push(c.pipe(map(t => t.photo)));
      }
      return combineLatest(result).pipe(map(photos => photos.filter(p => !!p)));
    }
    return this.http.get<{trail: TrailDto, photos: PhotoDto[]}>(environment.apiBaseUrl + '/moderation/v1/trailToReview/' + trailUuid + '/' + owner).pipe(
      switchMap(response => {
        this.trailAndPhotosCache.feedItem(response);
        let c = this.trailCache.getItem(response.trail.uuid + ' ' + response.trail.owner);
        const trail = new Trail(response.trail, true);
        if (c) {
          c.next({key: response.trail.uuid + ' ' + response.trail.owner, trail});
        } else {
          c = new BehaviorSubject<{key: string, trail: Trail | null}>({key: response.trail.uuid + ' ' + response.trail.owner, trail});
        }
        this.trailCache.feedItem(c);
        return this.getPhotos$(owner, trailUuid);
      }),
    );
  }

  public getPhoto$(owner: string, uuid: string, fromTrailUuid: string): Observable<Photo | null> {
    const c = this.photoCache.getItem(uuid + ' ' + owner);
    if (c) return c.pipe(map(p => p.photo));
    return this.getPhotos$(owner, fromTrailUuid).pipe(
      switchMap(photos => {
        if (!photos.find(p => p.uuid === uuid)) return of(null);
        return this.getPhoto$(owner, uuid, fromTrailUuid);
      })
    );
  }

  public getFullTrack$(trailUuid: string, trailOwner: string, trackUuid: string): Observable<Track> {
    const fromCache = this.trackCache.getItem(trackUuid + ' ' + trailOwner);
    if (fromCache) return of(fromCache);
    return this.http.get<TrackDto>(environment.apiBaseUrl + '/moderation/v1/trackFromReview/' + trailUuid + '/' + trailOwner + '/' + trackUuid).pipe(
      map(dto => new Track(dto, this.preferencesService)),
      tap(track => this.trackCache.feedItem(track))
    );
  }

  public getTrackMetadata$(trailUuid: string, trailOwner: string, trackUuid: string): Observable<TrackMetadataSnapshot> {
    return this.getFullTrack$(trailUuid, trailOwner, trackUuid).pipe(map(track => TrackDatabase.toMetadata(track)));
  }

  public getSimplifiedTrack$(trailUuid: string, trailOwner: string, trackUuid: string): Observable<SimplifiedTrackSnapshot> {
    return this.getFullTrack$(trailUuid, trailOwner, trackUuid).pipe(map(track => TrackDatabase.simplify(track)));
  }

  public getPhotoBlob$(photoUuid: string, owner: string): Observable<Blob> {
    return from(this.photoBlobCache.getItem(photoUuid + ' ' + owner)).pipe(
      switchMap(fromCache => {
        if (fromCache) return of(fromCache.blob);
        return this.http.getBlob(environment.apiBaseUrl + '/moderation/v1/photoFromReview/' + photoUuid + '/' + owner).pipe(
          tap(blob => this.photoBlobCache.feedItem({photo_uuid: photoUuid, photo_owner: owner, blob})),
        );
      })
    );
  }

  public saveTrail(trail: Trail): Observable<Trail | null> {
    return this.http.put<TrailDto>(environment.apiBaseUrl + '/moderation/v1/trailToReview', trail.toDto()).pipe(
      switchMap(response => {
        const trail = new Trail(response, true);
        let c = this.trailCache.getItem(trail.uuid + ' ' + trail.owner);
        const ti = {key: trail.uuid + ' ' + trail.owner, trail};
        if (c) {
          c.next(ti);
        } else {
          c = new BehaviorSubject<{key: string, trail: Trail | null}>(ti);
        }
        this.trailCache.feedItem(c);
        const c2 = this.trailAndPhotosCache.getItem(response.uuid + ' ' + response.owner);
        if (c2) {
          c2.trail = response;
          this.trailAndPhotosCache.feedItem(c2);
        }
        return c.pipe(map(t => t.trail));
      }),
    );
  }

  public updatePhoto(photo: Photo): Observable<Photo | null> {
    return this.http.put<PhotoDto>(environment.apiBaseUrl + '/moderation/v1/photoFromReview', photo.toDto()).pipe(
      switchMap(response => {
        const photo = new Photo(response, true);
        let c = this.photoCache.getItem(photo.uuid + ' ' + photo.owner);
        const ti = {key: photo.uuid + ' ' + photo.owner, photo};
        if (c) {
          c.next(ti);
        } else {
          c = new BehaviorSubject<{key: string, photo: Photo | null}>(ti);
        }
        this.photoCache.feedItem(c);
        const c2 = this.trailAndPhotosCache.getItem(photo.trailUuid + ' ' + response.owner);
        if (c2) {
          const i = c2.photos.findIndex(p => p.uuid === photo.uuid);
          if (i >= 0) c2.photos.splice(i, 1);
          c2.photos.push(response);
          this.trailAndPhotosCache.feedItem(c2);
        }
        return c.pipe(map(t => t.photo));
      }),
    );
  }

  public deletePhoto(photo: Photo): Observable<any> {
    return this.http.delete(environment.apiBaseUrl + '/moderation/v1/photoFromReview/' + photo.uuid + '/' + photo.owner).pipe(
      defaultIfEmpty(true),
      map(() => {
        let c = this.photoCache.getItem(photo.uuid + ' ' + photo.owner);
        if (c) {
          c.next({key: photo.uuid + ' ' + photo.owner, photo: null});
        }
        const c2 = this.trailAndPhotosCache.getItem(photo.trailUuid + ' ' + photo.owner);
        if (c2) {
          const i = c2.photos.findIndex(p => p.uuid === photo.uuid);
          if (i >= 0) c2.photos.splice(i, 1);
          this.trailAndPhotosCache.feedItem(c2);
        }
        this.photoBlobCache.removeItem(photo.uuid + ' ' + photo.owner);
        return true;
      }),
    );
  }

  public updateTrack(trail: Trail, newTrack: Track): Observable<Trail | null> {
    return this.http.put<TrailDto>(environment.apiBaseUrl + '/moderation/v1/trackFromReview/' + trail.uuid + '/' + trail.owner, newTrack.toDto()).pipe(
      switchMap(response => {
        const trail = new Trail(response, true);
        let c = this.trailCache.getItem(trail.uuid + ' ' + trail.owner);
        const ti = {key: trail.uuid + ' ' + trail.owner, trail};
        if (c) {
          c.next(ti);
        } else {
          c = new BehaviorSubject<{key: string, trail: Trail | null}>(ti);
        }
        this.trailCache.feedItem(c);
        const c2 = this.trailAndPhotosCache.getItem(response.uuid + ' ' + response.owner);
        if (c2) {
          c2.trail = response;
          this.trailAndPhotosCache.feedItem(c2);
        }
        return c.pipe(map(t => t.trail));
      })
    );
  }

  public async validateAndPublish(trail: Trail, track: Track, photos: Photo[], ondone?: (success: boolean) => void) {
    const progress = this.injector.get(ProgressService).create(this.injector.get(I18nService).texts.publications.moderation.publishing, 9);
    const step = <T>(work: number, op: () => T) => new Promise<T>(resolve => {
      setTimeout(() => {
        const result = op();
        progress.addWorkDone(work);
        resolve(result);
      }, 0);
    });

    const tile128ByZoom: number[] = [];
    await step(1, () => {
      const crs = L.CRS.EPSG3857;
      const departure = track.departurePoint!.pos;
      for (let zoom = 1; zoom <= 10; ++zoom) {
        const point = crs.latLngToPoint(departure, zoom);
        tile128ByZoom.push((point.y / 128) * (4 << zoom) + point.x / 128);
      }
    });

    const simplifiedPath: number[] = [];
    await step(1, () => {
      const simplifiedTrack = TrackDatabase.simplify(track);
      for (let point of simplifiedTrack.points) {
        simplifiedPath.push(point.lat);
        simplifiedPath.push(point.lng);
      }
    });

    const breaksDuration = await step(1, () => calculateLongBreaksFromTrack(track, 3 * 60 * 1000, 50));
    const estimatedDuration = await step(1, () => estimateTimeForTrack(track, 5000));
    const fullTrack = await step(1, () => track.toDto());

    const photosDtos = await step(1, () => {
      const result: CreatePublicTrailPhotoDto[] = [];
      photos.sort((p1, p2) => p1.index - p2.index);
      for (let index = 0; index < photos.length; ++index) {
        const p = photos[index];
        let photoPos: L.LatLngLiteral | undefined;
        let photoDate: number | undefined;

        if (p.latitude !== undefined && p.longitude !== undefined) {
          const pos = {lat: p.latitude, lng: p.longitude};
          const ref = TrackUtils.findClosestPointInTrack(pos, track, 100);
          if (ref) {
            photoPos = track.segments[ref.segmentIndex].points[ref.pointIndex].pos;
            photoDate = track.segments[ref.segmentIndex].points[ref.pointIndex].time;
          }
        }
        if (p.dateTaken !== undefined) {
          const closest = TrackUtils.findClosestPointForTime(track, p.dateTaken);
          if (closest) {
            photoDate = p.dateTaken;
            photoPos ??= {lat: closest.pos.lat, lng: closest.pos.lng};
          }
        }
        result.push({
          uuid: p.uuid,
          index,
          lat: photoPos?.lat,
          lng: photoPos?.lng,
          date: photoDate,
          description: p.description,
        })
      }
      return result;
    });

    const dto: CreatePublicTrailDto = {
      trailUuid: trail.uuid,
      author: trail.owner,
      name: trail.name,
      description: trail.description,
      location: trail.location,
      date: trail.date!,
      distance: Math.floor(track.metadata.distance),
      positiveElevation: TypeUtils.floor(track.metadata.positiveElevation),
      negativeElevation: TypeUtils.floor(track.metadata.negativeElevation),
      highestAltitude: TypeUtils.floor(track.metadata.highestAltitude),
      lowestAltitude: TypeUtils.floor(track.metadata.lowestAltitude),
      duration: TypeUtils.floor(track.metadata.duration),
      breaksDuration,
      estimatedDuration,
      loopType: trail.loopType!,
      activity: trail.activity!,
      boundsNorth: track.metadata.bounds!.getNorth(),
      boundsSouth: track.metadata.bounds!.getSouth(),
      boundsWest: track.metadata.bounds!.getWest(),
      boundsEast: track.metadata.bounds!.getEast(),
      tile128ByZoom,
      simplifiedPath,
      fullTrack: fullTrack.s!,
      wayPoints: fullTrack.wp!,
      photos: photosDtos,
    };

    this.http.post(environment.apiBaseUrl + '/moderation/v1/publish', dto).subscribe({
      next: () => {
        progress.addWorkDone(1);
        step(1, () => {
          this.trailCache.getItem(trail.uuid + ' ' + trail.owner)?.next({key: trail.uuid + ' ' + trail.owner, trail: null});
          this.trailAndPhotosCache.removeItem(trail.uuid + ' ' + trail.owner);
          this.trackCache.removeItem(trail.originalTrackUuid + ' ' + trail.owner);
          this.trackCache.removeItem(trail.currentTrackUuid + ' ' + trail.owner);
          photos.forEach(p => {
            this.photoCache.getItem(p.uuid + ' ' + p.owner)?.next({key: p.uuid + ' ' + p.owner, photo: null});
            this.photoBlobCache.removeItem(p.uuid + ' ' + p.owner);
          });
        }).then(() => {
          progress.done();
          if (ondone) ondone(true);
        });
      },
      error: e => {
        Console.error('Error publishing', e);
        this.injector.get(ErrorService).addNetworkError(e, 'publications.moderation.error_publishing', []);
        progress.done();
        if (ondone) ondone(false);
      },
    });
    progress.addWorkDone(1);
  }

}

interface CreatePublicTrailDto {

  trailUuid: string;
  author: string;

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

  tile128ByZoom: number[];

  simplifiedPath: number[];
  fullTrack: SegmentDto[];
  wayPoints: WayPointDto[];

  photos: CreatePublicTrailPhotoDto[];

}

interface CreatePublicTrailPhotoDto {
  uuid: string;
  index: number;
  lat?: number;
  lng?: number;
  date?: number;
  description: string;
}
