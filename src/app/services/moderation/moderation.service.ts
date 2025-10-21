import { Injectable, Injector, SecurityContext } from '@angular/core';
import { HttpService } from '../http/http.service';
import { BehaviorSubject, combineLatest, defaultIfEmpty, EMPTY, from, map, Observable, of, switchMap, tap } from 'rxjs';
import { Trail } from 'src/app/model/trail';
import { TrailDto, TrailSourceType } from 'src/app/model/dto/trail';
import { environment } from 'src/environments/environment';
import { TrackDatabase } from '../database/track-database';
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
import { PointDtoMapper } from 'src/app/model/point-dto-mapper';
import { Feedback, FeedbackReply } from '../feedback/feedback.service';
import { SimplifiedTrackSnapshot, TrackMetadataSnapshot } from 'src/app/model/snapshots';
import { DomSanitizer } from '@angular/platform-browser';

@Injectable({providedIn: 'root'})
export class ModerationService {

  private readonly trailCache: TimeoutCache<BehaviorSubject<Trail | null>>;
  private readonly trackCache: TimeoutCache<Track>;
  private readonly trailAndPhotosCache: TimeoutCache<{trail: TrailDto, photos: PhotoDto[]}>;
  private readonly photoCache: TimeoutCache<BehaviorSubject<Photo | null>>;
  private readonly photoBlobCache: TimeoutCacheDb<{blob: Blob}>;

  constructor(
    private readonly http: HttpService,
    private readonly preferencesService: PreferencesService,
    cacheService: CacheService,
    private readonly injector: Injector,
  ) {
    this.trailCache = cacheService.createTimeoutCache(60000);
    this.trackCache = cacheService.createTimeoutCache(5 * 60 * 1000);
    this.trailAndPhotosCache = cacheService.createTimeoutCache(90000);
    this.photoCache = cacheService.createTimeoutCache(15 * 60 * 1000);
    this.photoBlobCache = cacheService.createTimeoutCacheDb('photo_blob', 15 * 60 * 1000);
  }

  public getTrailsToReview(): Observable<Observable<Trail | null>[]> {
    return this.http.get<{trail: TrailDto, photos: PhotoDto[]}[]>(environment.apiBaseUrl + '/moderation/v1/trailsToReview?size=50').pipe(
      tap(response => this.trailAndPhotosCache.feedList(response.map(r => ({key: r.trail.uuid + ' ' + r.trail.owner, item: r})))),
      switchMap(dtos =>
        (dtos.length === 0 ? of([]) : combineLatest(dtos.map(dto => this.trailCache.getItem(dto.trail.uuid + ' ' + dto.trail.owner)))).pipe(
          map(items$ => ({dtos, items$}))
        )
      ),
      map(result => result.dtos.map((dto, index) => {
        const trail = new Trail(dto.trail, true);
        let trail$ = result.items$[index];
        if (trail$) {
          trail$.next(trail);
        } else {
          trail$ = new BehaviorSubject<Trail | null>(trail);
        }
        return trail$;
      })),
    );
  }

  public getTrail$(uuid: string, owner: string): Observable<Trail | null> {
    return from(this.trailCache.getItem(uuid + ' ' + owner)).pipe(
      switchMap(fromCache => {
        if (fromCache) return fromCache;
        return this.fetchTrail(uuid, owner);
      })
    );
  }

  private fetchTrail(uuid: string, owner: string): Observable<Trail | null> {
    return this.http.get<{trail: TrailDto, photos: PhotoDto[]}>(environment.apiBaseUrl + '/moderation/v1/trailToReview/' + uuid + '/' + owner).pipe(
      switchMap(response => {
        this.trailAndPhotosCache.feedItem(uuid + ' ' + owner, response);
        const trail = new Trail(response.trail, true);
        const trail$ = new BehaviorSubject<Trail | null>(trail);
        this.trailCache.feedItem(uuid + ' ' + owner, trail$);
        return trail$;
      }),
    );
  }

  public getPhotos$(owner: string, trailUuid: string): Observable<Photo[]> {
    const trailKey = trailUuid + ' ' + owner;
    return from(this.trailAndPhotosCache.getItem(trailKey)).pipe(
      switchMap(fromCache => {
        if (fromCache) {
          if (fromCache.photos.length === 0) return of([]);
          return combineLatest(fromCache.photos.map(p => this.photoCache.getItem(p.uuid + ' ' + p.owner))).pipe(
            switchMap(photosFromCache => {
              const photos$: BehaviorSubject<Photo | null>[] = [];
              for (let i = 0; i < fromCache.photos.length; ++i) {
                let photo$ = photosFromCache[i];
                const photo = new Photo(fromCache.photos[i], true);
                if (photo$) {
                  photo$.next(photo);
                } else {
                  photo$ = new BehaviorSubject<Photo | null>(photo);
                }
                photos$.push(photo$);
                this.photoCache.feedItem(photo.uuid + ' ' + photo.owner, photo$);
              }
              return combineLatest(photos$);
            })
          );
        }
        return this.fetchTrail(trailUuid, owner).pipe(
          switchMap(() => this.getPhotos$(owner, trailUuid))
        );
      }),
      map(photos => photos.filter(p => !!p)),
    );
  }

  public getPhoto$(owner: string, uuid: string, fromTrailUuid: string): Observable<Photo | null> {
    return from(this.photoCache.getItem(uuid + ' ' + owner)).pipe(
      switchMap(fromCache => {
        if (fromCache) return fromCache;
        return this.getPhotos$(owner, fromTrailUuid).pipe(
          switchMap(photos => {
            if (!photos.some(p => p.uuid === uuid)) return of(null);
            return this.getPhoto$(owner, uuid, fromTrailUuid);
          })
        );
      })
    );
  }

  public getFullTrack$(trailUuid: string, trailOwner: string, trackUuid: string): Observable<Track> {
    return from(this.trackCache.getItem(trackUuid + ' ' + trailOwner)).pipe(
      switchMap(fromCache => {
        if (fromCache) return of(fromCache);
        return this.http.get<TrackDto>(environment.apiBaseUrl + '/moderation/v1/trackFromReview/' + trailUuid + '/' + trailOwner + '/' + trackUuid).pipe(
          map(dto => new Track(dto, this.preferencesService)),
          tap(track => this.trackCache.feedItem(trackUuid + ' ' + trailOwner, track))
        );
      })
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
          tap(blob => this.photoBlobCache.feedItem(photoUuid + ' ' + owner, {blob})),
        );
      })
    );
  }

  public saveTrail(trail: Trail): Observable<Trail | null> {
    return this.http.put<TrailDto>(environment.apiBaseUrl + '/moderation/v1/trailToReview', trail.toDto()).pipe(
      switchMap(response => {
        const trail = new Trail(response, true);
        return from(Promise.all([
          this.trailCache.getItem(trail.uuid + ' ' + trail.owner),
          this.trailAndPhotosCache.getItem(response.uuid + ' ' + response.owner)
        ])).pipe(
          switchMap(fromCache => {
            let trail$: BehaviorSubject<Trail | null>;
            if (fromCache[0]) {
              fromCache[0].next(trail);
              trail$ = fromCache[0];
            } else {
              trail$ = new BehaviorSubject<Trail | null>(trail);
            }
            this.trailCache.feedItem(trail.uuid + ' ' + trail.owner, trail$);
            if (fromCache[1]) {
              fromCache[1].trail = response;
              this.trailAndPhotosCache.feedItem(response.uuid + ' ' + response.owner, fromCache[1]);
            }
            return trail$;
          })
        );
      }),
    );
  }

  public updatePhoto(photo: Photo): Observable<Photo | null> {
    return this.http.put<PhotoDto>(environment.apiBaseUrl + '/moderation/v1/photoFromReview', photo.toDto()).pipe(
      switchMap(response => {
        const photo = new Photo(response, true);
        return from(Promise.all([
          this.photoCache.getItem(photo.uuid + ' ' + photo.owner),
          this.trailAndPhotosCache.getItem(photo.trailUuid + ' ' + response.owner),
        ])).pipe(
          switchMap(fromCache => {
            let photo$: BehaviorSubject<Photo | null>;
            if (fromCache[0]) {
              photo$ = fromCache[0];
              fromCache[0].next(photo);
            } else {
              photo$ = new BehaviorSubject<Photo | null>(photo);
            }
            this.photoCache.feedItem(photo.uuid + ' ' + photo.owner, photo$);
            if (fromCache[1]) {
              const i = fromCache[1].photos.findIndex(p => p.uuid === photo.uuid);
              if (i >= 0) fromCache[1].photos.splice(i, 1);
              fromCache[1].photos.push(response);
              this.trailAndPhotosCache.feedItem(photo.trailUuid + ' ' + response.owner, fromCache[1]);
            }
            return photo$;
          })
        );
      }),
    );
  }

  public deletePhoto(photo: Photo): Observable<any> {
    return this.http.delete(environment.apiBaseUrl + '/moderation/v1/photoFromReview/' + photo.uuid + '/' + photo.owner).pipe(
      defaultIfEmpty(true),
      switchMap(() => from(Promise.all([
          this.photoCache.getItem(photo.uuid + ' ' + photo.owner),
          this.trailAndPhotosCache.getItem(photo.trailUuid + ' ' + photo.owner),
        ])).pipe(
          map(fromCache => {
            if (fromCache[0]) fromCache[0].next(null);
            if (fromCache[1]) {
              const i = fromCache[1].photos.findIndex(p => p.uuid === photo.uuid);
              if (i >= 0) fromCache[1].photos.splice(i, 1);
              this.trailAndPhotosCache.feedItem(photo.trailUuid + ' ' + photo.owner, fromCache[1]);
            }
            this.photoBlobCache.removeItem(photo.uuid + ' ' + photo.owner);
            return true;
          })
        )
      )
    );
  }

  public updateTrack(trail: Trail, newTrack: Track): Observable<Trail | null> {
    return this.http.put<TrailDto>(environment.apiBaseUrl + '/moderation/v1/trackFromReview/' + trail.uuid + '/' + trail.owner, newTrack.toDto()).pipe(
      switchMap(response => {
        const trail = new Trail(response, true);
        return from(Promise.all([
          this.trailCache.getItem(trail.uuid + ' ' + trail.owner),
          this.trailAndPhotosCache.getItem(response.uuid + ' ' + response.owner),
        ])).pipe(
          switchMap(fromCache => {
            let trail$: BehaviorSubject<Trail | null>;
            if (fromCache[0]) {
              trail$ = fromCache[0];
              trail$.next(trail);
            } else {
              trail$ = new BehaviorSubject<Trail | null>(trail);
            }
            this.trailCache.feedItem(trail.uuid + ' ' + trail.owner, trail$);
            if (fromCache[1]) {
              fromCache[1].trail = response;
              this.trailAndPhotosCache.feedItem(response.uuid + ' ' + response.owner, fromCache[1]);
            }
            return trail$;
          })
        );
      })
    );
  }


  public reject(trail: Trail, message: string, photos: Photo[] | undefined): void {
    trail.publicationMessageFromModerator = message;
    this.http.post<TrailDto>(environment.apiBaseUrl + '/moderation/v1/reject', trail.toDto()).subscribe(
      response => {
        this.endOfModeration(trail, photos ?? []);
      },
    );
  }

  public getPublicUuid(trailUuid: string, trailOwner: string): Observable<string> {
    return this.http.getString(environment.apiBaseUrl + '/moderation/v1/trailToReview/' + trailUuid + '/' + trailOwner + '/currentPublic').pipe(
      switchMap(uuid => {
        if (uuid.length > 0) return of(uuid);
        return EMPTY;
      })
    );
  }

  public detectLanguage(text: string): Observable<string> {
    return this.http.postString(environment.apiBaseUrl + '/moderation/v1/detectLanguage', text);
  }

  public translate(text: string, from: string, to: string): Observable<string> {
    return this.http.postString(environment.apiBaseUrl + '/moderation/v1/translate?from=' + from + '&to=' + to, text);
  }

  public translateWithAI(text: string): Observable<string> {
    return this.http.postString(environment.apiBaseUrl + '/moderation/v1/translateai', text);
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
        tile128ByZoom.push(Math.floor(point.y / 128) * (4 << zoom) + Math.floor(point.x / 128));
      }
    });

    const simplifiedPath: number[] = [];
    await step(1, () => {
      const simplifiedTrack = TrackDatabase.simplify(track);
      for (let point of simplifiedTrack.points) {
        simplifiedPath.push(point.lat, point.lng);
      }
    });

    const breaksDuration = await step(1, () => calculateLongBreaksFromTrack(track, 3 * 60 * 1000, 50));
    const estimatedDuration = await step(1, () => estimateTimeForTrack(track, 5000));
    const fullTrack = await step(1, () => track.toDto());

    const photosDtos = await step(1, () => { // NOSONAR
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
          lat: photoPos ? PointDtoMapper.writeCoordValue(photoPos.lat) : undefined,
          lng: photoPos ? PointDtoMapper.writeCoordValue(photoPos.lng) : undefined,
          date: photoDate,
          description: p.description,
        })
      }
      return result;
    });

    const dto: CreatePublicTrailDto = {
      trailUuid: trail.uuid,
      author: trail.owner,
      authorUuid: trail.publishedFromUuid,
      name: trail.name,
      description: this.injector.get(DomSanitizer).sanitize(SecurityContext.HTML, trail.description) ?? '',
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
      lang: trail.publicationData!['lang'],
      nameTranslations: trail.publicationData!['nameTranslations'],
      descriptionTranslations: trail.publicationData!['descriptionTranslations'],
      sourceUrl: trail.sourceType === TrailSourceType.EXTERNAL ? trail.source : undefined,
    };

    this.http.post(environment.apiBaseUrl + '/moderation/v1/publish', dto).subscribe({
      next: () => {
        progress.addWorkDone(1);
        step(1, async () => {
          await this.endOfModeration(trail, photos);
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

  private async endOfModeration(trail: Trail, photos: Photo[]) {
    (await this.trailCache.getItem(trail.uuid + ' ' + trail.owner))?.next(null);
    await this.trailAndPhotosCache.removeItem(trail.uuid + ' ' + trail.owner);
    await this.trackCache.removeItem(trail.originalTrackUuid + ' ' + trail.owner);
    await this.trackCache.removeItem(trail.currentTrackUuid + ' ' + trail.owner);
    for (const p of photos) {
      (await this.photoCache.getItem(p.uuid + ' ' + p.owner))?.next(null);
      await this.photoBlobCache.removeItem(p.uuid + ' ' + p.owner);
    }
  }

  public getFeedbacksToReview(): Observable<FeedbackToReview[]> {
    return this.http.get<FeedbackToReview[]>(environment.apiBaseUrl + '/moderation/v1/commentsToReview');
  }

  public validateFeedback(feedback: Feedback): Observable<Feedback> {
    return this.http.put<void>(environment.apiBaseUrl + '/moderation/v1/commentsToReview/validate/' + feedback.uuid, {}).pipe(
      defaultIfEmpty(true),
      map(() => {
        feedback.reviewed = true;
        return feedback;
      }),
    );
  }

  public validateFeedbackReply(reply: FeedbackReply): Observable<FeedbackReply> {
    return this.http.put<void>(environment.apiBaseUrl + '/moderation/v1/commentsToReview/reply/validate/' + reply.uuid, {}).pipe(
      defaultIfEmpty(true),
      map(() => {
        reply.reviewed = true;
        return reply;
      }),
    );
  }

  public deletePublicTrail(uuid: string): Observable<any> {
    return this.http.delete(environment.apiBaseUrl + '/moderation/v1/publicTrail/' + uuid)
  }
}

interface CreatePublicTrailDto {

  trailUuid: string;
  author: string;
  authorUuid?: string;

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

  lang: string;
  nameTranslations: {[key: string]: string};
  descriptionTranslations: {[key: string]: string};

  sourceUrl?: string;

}

interface CreatePublicTrailPhotoDto {
  uuid: string;
  index: number;
  lat?: number;
  lng?: number;
  date?: number;
  description: string;
}

export interface FeedbackToReview {
  trailUuid: string;
  trailName: string;
  trailDescription: string;
  feedbacks: Feedback[];
}
