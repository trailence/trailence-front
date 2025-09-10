import { PointDescriptor } from 'front/model/point-descriptor';
import { TrailenceClient } from './../trailence/trailence-client';
import { TrailDto } from 'front/model/dto/trail';
import { TrackDto } from 'front/model/dto/track';
import { WayPoint } from 'front/model/way-point';
import { SegmentDto } from 'front/model/dto/segment';
import { EMPTY } from 'rxjs';
import { preferences } from 'src/trailence/preferences';
import { Config } from 'src/config/config';
import { Photo } from 'front/model/photo';

export abstract class Importer {

  constructor(
    protected readonly trailenceClient: TrailenceClient,
    protected readonly config: Config,
  ) {
  }

  public abstract importTrails(): Promise<any>;

  protected async createTrailOnTrailence(trail: TrailDto, track: PointDescriptor[][], wayPoints: WayPoint[], photos: {blob: Blob, photo: Photo}[]) {
    trail.uuid ??= crypto.randomUUID();
    const trackDto: TrackDto = {
      owner: trail.owner,
      uuid: trail.uuid,
      version: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      s: await this.trackToDto(track),
      wp: wayPoints.map(wp => wp.toDto())
    };
    trail.originalTrackUuid = trail.uuid;
    trail.currentTrackUuid = trail.uuid;

    if (!trail.loopType) {
      console.log('Detecting loop type');
      const loopTypeDetectionModule = await import('front/services/track-edition/path-analysis/loop-type-detection.js');
      const trackModule = await import('front/model/track.js');
      const fakePreferencesService = new FakePreferencesService();
      trail.loopType = loopTypeDetectionModule.detectLoopType(new trackModule.Track(trackDto, fakePreferencesService as any));
    }

    await this.trailenceClient.createTrack(trackDto);
    await this.trailenceClient.createTrail(trail);
    for (const photo of photos) {
      await this.trailenceClient.createPhoto(photo.photo.toDto(), photo.blob);
    }
  }

  protected async trackToDto(track: PointDescriptor[][]): Promise<SegmentDto[]> {
    const segments: SegmentDto[] = [];
    for (const s of track) {
      segments.push(await this.segmentToDto(s));
    }
    return segments;
  }

  protected async segmentToDto(segment: PointDescriptor[]): Promise<SegmentDto> {
    const mapperModule = await import('front/model/point-dto-mapper');
    const nb = segment.length;
    const dto: SegmentDto = {p: new Array(nb)};
    let previousPoint: PointDescriptor | undefined = undefined;
    for (let i = 0; i < nb; ++i) {
      const pointDto = mapperModule.PointDtoMapper.toDto(segment[i], previousPoint);
      previousPoint = segment[i];
      dto.p![i] = pointDto;
    }
    return dto;
  }

  protected async publishTrail(trail: TrailDto, track: PointDescriptor[][], wayPoints: WayPoint[], photos: {blob: Blob, photo: Photo}[]) {
    const myTrailsPhoto = this.config.getRequiredBoolean('trailence', 'photos_in_my_trails', false) ? photos :
      photos.map(p => ({photo: p.photo, blob: new Blob([new ArrayBuffer(1)])}));
    await this.createTrailOnTrailence(trail, track, wayPoints, myTrailsPhoto);
    const pubSubmit = await this.trailenceClient.getOrCreatePubSubmit();
    trail.collectionUuid = pubSubmit.uuid;
    trail.publishedFromUuid = trail.uuid;
    trail.uuid = crypto.randomUUID();
    if (photos.length > 0) {
      const module = await import('front/model/photo.js');
      for (const p of photos) {
        p.photo = new module.Photo({...p.photo.toDto(), uuid: crypto.randomUUID(), trailUuid: trail.uuid});
      }
    }
    trail.publicationMessageFromAuthor = 'Imported from script';
    if (this.config.getRequiredBoolean('trailence', 'publish', true))
      await this.createTrailOnTrailence(trail, track, wayPoints, photos);
  }
}

export class FakePreferencesService {
  public preferences$ = EMPTY;
  public preferences = preferences;
}
