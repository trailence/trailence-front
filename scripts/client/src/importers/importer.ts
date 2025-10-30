import { PointDescriptor } from 'front/model/point-descriptor';
import { TrailenceClient } from './../trailence/trailence-client';
import { TrailDto } from 'front/model/dto/trail';
import { TrackDto } from 'front/model/dto/track';
import { WayPoint } from 'front/model/way-point.js';
import { SegmentDto } from 'front/model/dto/segment';
import { FakePreferencesService } from 'src/trailence/preferences';
import { Config } from 'src/config/config';
import { Photo } from 'front/model/photo';
import { ConsoleProgress } from 'src/utils/progress';

export abstract class Importer {

  constructor(
    protected readonly trailenceClient: TrailenceClient,
    protected readonly config: Config,
  ) {
  }

  public abstract importTrails(): Promise<any>;

  protected async createTrailOnTrailence(trail: TrailDto, track: PointDescriptor[][], wayPoints: WayPoint[], photos: {blob: Blob, photo: Photo}[], progressText?: string) {
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

    const progress = new ConsoleProgress('Create trail on Trailence' + (progressText ? ' (' + progressText + ')' : ''), 2 + photos.length);

    progress.setSubText('Create track');
    await this.trailenceClient.createTrack(trackDto);
    progress.addWorkDone(1, 'Create trail');
    await this.trailenceClient.createTrail(trail);
    progress.addWorkDone(1);
    for (let i = 0; i < photos.length; ++i) {
      progress.setSubText('Create photo ' + (i + 1) + '/' + photos.length);
      const photo = photos[i];
      await this.trailenceClient.createPhoto(photo.photo.toDto(), photo.blob);
      progress.addWorkDone(1, '');
    }
    progress.done();
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

  protected async readTrackDto(track: TrackDto): Promise<{segments: PointDescriptor[][], wayPoints: WayPoint[]}> {
    const mapperModule = await import('front/model/point-dto-mapper');
    const segments: PointDescriptor[][] = [];
    for (const segment of track.s!) {
      segments.push(mapperModule.PointDtoMapper.toPoints(segment.p!));
    }
    const wayPointModule = await import('front/model/way-point');
    const wayPoints: WayPoint[] = [];
    if (track.wp) {
      for (const wp of track.wp) {
        wayPoints.push(new wayPointModule.WayPoint({
          pos: {
            lat: mapperModule.PointDtoMapper.readCoordValue(wp.l),
            lng: mapperModule.PointDtoMapper.readCoordValue(wp.n),
          },
          ele: wp.e !== undefined ? mapperModule.PointDtoMapper.readElevationValue(wp.e) : undefined,
          time: wp.t,
        }, wp.na ?? '', wp.de ?? '', wp.nt, wp.dt));
      }
    }
    return {segments, wayPoints};
  }

  protected async publishTrail(trail: TrailDto, track: PointDescriptor[][], wayPoints: WayPoint[], photos: {blob: Blob, photo: Photo}[]) {
    const myTrailsPhoto = this.config.getRequiredBoolean('trailence', 'photos_in_my_trails', false) ? photos :
      photos.map(p => ({photo: p.photo, blob: new Blob([new ArrayBuffer(1)])}));
    await this.createTrailOnTrailence(trail, track, wayPoints, myTrailsPhoto, 'in My Trails');
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
      await this.createTrailOnTrailence(trail, track, wayPoints, photos, 'in Draft    ');
  }

  protected checkTrailUpdates(existing: TrailDto, updated: TrailDto): DtoUpdate<TrailDto>[] {
    const updates = this.checkDtoUpdates<TrailDto>(existing, updated, [
      'name',
      'description',
      'location',
    ]);
    return updates;
  }

  protected checkDtoUpdates<T>(existing: T, updated: T, fields: string[]): DtoUpdate<T>[] {
    const updates: DtoUpdate<T>[] = [];
    for (const field of fields) {
      const update = this.checkFieldUpdate(field, existing, updated);
      if (update) updates.push(update);
    }
    return updates;
  }

  protected checkFieldUpdate(field: string, existing: any, updated: any): DtoUpdate<any> | undefined {
    if (existing[field] === updated[field]) return undefined;
    return {
      description: field,
      previousValue: existing[field],
      newValue: updated[field],
      update: (dto: any) => { dto[field] = updated[field]; }
    };
  }
}

export interface DtoUpdate<T> {
  description: string;
  previousValue: string;
  newValue: string;
  update: (dto: T) => void;
}
