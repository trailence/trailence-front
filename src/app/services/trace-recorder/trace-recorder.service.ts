import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, EMPTY, Observable, Subscription, catchError, combineLatest, concat, defaultIfEmpty, first, firstValueFrom, from, map, of, skip, switchMap, takeLast, tap, throwError, timeout, timer } from 'rxjs';
import { TrackDto } from 'src/app/model/dto/track';
import { TrailDto, TrailSourceType } from 'src/app/model/dto/trail';
import { Track } from 'src/app/model/track';
import { Trail } from 'src/app/model/trail';
import { AuthService } from '../auth/auth.service';
import Dexie from 'dexie';
import { I18nService } from '../i18n/i18n.service';
import { TrailCollectionService } from '../database/trail-collection.service';
import { GeolocationService } from '../geolocation/geolocation.service';
import { PointDto } from 'src/app/model/dto/point';
import { Point } from 'src/app/model/point';
import { PreferencesService } from '../preferences/preferences.service';
import { TrackService } from '../database/track.service';
import { TrailService } from '../database/trail.service';
import * as L from 'leaflet';
import { GeolocationState } from '../geolocation/geolocation.interface';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { ImprovmentRecordingState, ImprovmentRecordingStateDto, TrackEditionService } from '../track-edition/track-edition.service';
import { ProgressService } from '../progress/progress.service';
import { ErrorService } from '../progress/error.service';
import { Console } from 'src/app/utils/console';
import { Segment } from 'src/app/model/segment';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { ScreenLockService } from '../screen-lock/screen-lock.service';
import { CompositeOnDone } from 'src/app/utils/callback-utils';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { environment } from 'src/environments/environment';
import { Photo } from 'src/app/model/photo';
import { PhotoDto } from 'src/app/model/dto/photo';
import { PhotoService } from '../database/photo.service';
import { BinaryContent } from 'src/app/utils/binary-content';
import { CameraService } from '../camera/camera.service';

@Injectable({
  providedIn: 'root'
})
export class TraceRecorderService {

  private readonly _recording$ = new BehaviorSubject<Recording | null | undefined>(undefined);
  private _db?: Dexie;
  private _table?: Dexie.Table<RecordingDto | {key: string, photo: ArrayBuffer}, string>;
  private _email?: string;
  private _saving = false;
  private _saved = true;
  private _changesSubscription?: Subscription;

  constructor(
    auth: AuthService,
    private readonly i18n: I18nService,
    private readonly collectionService: TrailCollectionService,
    private readonly geolocation: GeolocationService,
    private readonly preferencesService: PreferencesService,
    private readonly trackService: TrackService,
    private readonly trailService: TrailService,
    private readonly alertController: AlertController,
    private readonly trackEdition: TrackEditionService,
    private readonly ngZone: NgZone,
    private readonly progressService: ProgressService,
    private readonly errorService: ErrorService,
    private readonly screenLockService: ScreenLockService,
    private readonly toastController: ToastController,
    private readonly photoService: PhotoService,
    private readonly cameraService: CameraService,
  ) {
    auth.auth$.subscribe(
      auth => {
        if (!auth) this.closeDb();
        else this.openDb(auth.email);
      }
    );
  }

  public get recording(): boolean { return !!this._recording$.value; }
  public get current(): Recording | null { return this._recording$.value ?? null; }
  public get current$(): Observable<Recording | null | undefined> { return this._recording$; }

  private closeDb() {
    if (this._db) {
      Console.info('Closing trace recorder DB');
      this._changesSubscription?.unsubscribe();
      this._changesSubscription = undefined;
      if (this._geolocationListener) this.geolocation.stopWatching(this._geolocationListener);
      this._geolocationListener = undefined;
      this._recording$.next(null);
      this._db.close();
      this._email = undefined;
      this._db = undefined;
      this._table = undefined;
      this._saving = false;
      this._saved = true;
    }
  }

  private openDb(email: string) {
    if (this._email === email) return;
    this.closeDb();
    Console.info('Open trace recorder DB for user ' + email);
    this._email = email;
    this._db = new Dexie('trailence_record_' + email);
    const storesV1: any = {};
    storesV1['record'] = 'key';
    this._db.version(1).stores(storesV1);
    this._table = this._db.table<RecordingDto | {key: string, photo: ArrayBuffer}, string>('record');
    this._table.get('1')
    .then(dto => {
      const recording = dto ? Recording.fromDto(dto as RecordingDto, this.preferencesService) : null;
      if (recording) {
        Console.info('Trace in progress found in DB, start it');
        this._recording$.next(recording);
        if (!recording.paused) this.startRecording(recording);
      }
    })
    .catch(e => {
      Console.error('Error loading current trace', e);
      this._recording$.next(null);
    });
  }

  public start(following?: Trail): Promise<Recording> {
    if (!this._email) return Promise.reject();
    return new Promise<Recording>((resolve, reject) => {
      this.collectionService.getMyTrails$().pipe(timeout(30000)).subscribe({
        next: myTrails => {
          if (!this._email) { reject(); return; }
          const track = new Track({ owner: this._email }, this.preferencesService);
          const rawTrack = new Track({ owner: this._email }, this.preferencesService);
          const trail = new Trail({
            owner: this._email,
            name: this.i18n.texts.trace_recorder.trail_name_start + ' ' + this.i18n.timestampToDateTimeString(Date.now()),
            collectionUuid: myTrails.uuid,
            originalTrackUuid: rawTrack.uuid,
            currentTrackUuid: track.uuid,
            sourceType: TrailSourceType.TRAILENCE_RECORDER,
            source: this._email,
            sourceDate: Date.now(),
          });
          const recording = new Recording(
            trail,
            track,
            rawTrack,
            false,
            new ImprovmentRecordingState(),
            new RecordingStatus(0, undefined, undefined, undefined),
            new BehaviorSubject<Photo[]>([]),
            following?.uuid,
            following?.owner,
            following?.currentTrackUuid,
          );
          this.startRecording(recording).catch(e => reject(e)).then(() => resolve(recording));
        },
        error: e => reject(e)
      });
    });
  }

  public setFollowedTrail(owner?: string, uuid?: string, trackUuid?: string): void {
    const recording = this._recording$.value;
    if (!recording) return;
    recording.followingTrailUuid = uuid;
    recording.followingTrailOwner = owner;
    recording.followingTrackUuid = trackUuid;
    this.save(recording);
    this._recording$.next(recording);
  }

  public pause(): void {
    const recording = this._recording$.value;
    if (!recording) return;
    if (recording.paused) return;
    recording.paused = true;
    this.stopRecording(recording);
    this.save(recording);
    this._recording$.next(recording);
  }

  public resume(): Promise<any> {
    const recording = this._recording$.value;
    if (!recording) return Promise.reject(new Error('No current trace'));
    if (!recording.paused) return Promise.reject(new Error('Current trace is not paused'));
    recording.rawTrack.newSegment();
    recording.track.newSegment();
    recording.paused = false;
    recording.state = new ImprovmentRecordingState();
    recording.status = new RecordingStatus(0, undefined, undefined, undefined);
    this.save(recording);
    this._recording$.next(recording);
    return this.startRecording(recording);
  }

  public stop(save: boolean): Observable<Trail | null> {
    const recording = this._recording$.value;
    if (!recording) return of(null);
    this.stopRecording(recording);
    Console.info('Recording stopped');
    this._recording$.next(null);
    if (!save) {
      if (this._table) this._table.clear();
      return of(null);
    }
    if (!this._email) return of(null);
    this.save(recording);
    const progress = this.progressService.create(this.i18n.texts.trace_recorder.saving, 5 + recording.photos$.value.length);
    return timer(1).pipe(
      switchMap(() => {
        recording.rawTrack.removeEmptySegments();
        recording.track.removeEmptySegments();
        if (recording.rawTrack.segments.length === 0 || recording.track.segments.length === 0) {
          progress.done();
          this.alertController.create({
            header: this.i18n.texts.trace_recorder.saving,
            message: this.i18n.texts.trace_recorder.empty_trail,
            buttons: [{
              text: this.i18n.texts.buttons.ok,
              role: 'cancel'
            }]
          }).then(a => a.present());
          return EMPTY;
        }
        progress.addWorkDone(1);
        return of(1);
      }),
      switchMap(() => timer(1).pipe(
        map(() => {
          this.trackEdition.computeFinalMetadata(recording.trail, recording.track);
          progress.addWorkDone(1);
          return 2;
        })
      )),
      switchMap(() => {
        if (!recording.followingTrailUuid || !recording.followingTrailOwner) return of(3);
        return this.trailService.getTrail$(recording.followingTrailUuid, recording.followingTrailOwner).pipe(
          filterDefined(),
          timeout(15000),
          catchError(e => of(undefined)),
          first(),
          map(followedTrail => {
            if (!followedTrail) return 3;
            recording.trail.location ??= followedTrail.location;
            recording.trail.activity ??= followedTrail.activity;
            recording.trail.followedUuid = followedTrail.uuid;
            recording.trail.followedOwner = followedTrail.owner;
            recording.trail.followedUrl =
              followedTrail.sourceType === TrailSourceType.EXTERNAL ? followedTrail.source :
              followedTrail.sourceType === TrailSourceType.TRAILENCE_RECORDER ?
                (followedTrail.publishedFromUuid ? environment.baseUrl + '/trail/trailence/' + followedTrail.publishedFromUuid : followedTrail.followedUrl)  :
              undefined;
            return 4;
          }),
        )
      }),
      switchMap(() =>
        new Observable<Observable<Trail | null>>(subscriber => {
          const onSaved = new CompositeOnDone(() => subscriber.complete());
          this.trackService.create(recording.rawTrack, onSaved.add(() => progress.addWorkDone(1)));
          this.trackService.create(recording.track, onSaved.add(() => progress.addWorkDone(1)));
          const trail$ = this.trailService.create(recording.trail, onSaved.add(() => progress.addWorkDone(1)));
          if (this._table)
            for (const photo of recording.photos$.value) {
              const onPhotoDone = onSaved.add(() => progress.addWorkDone(1));
              this._table.get('photo:' + photo.uuid).then(p => {
                const content = (p as {key: string, photo: ArrayBuffer}).photo;
                return firstValueFrom(this.photoService.addPhoto(photo.owner, photo.trailUuid, photo.description, photo.index, content, photo.dateTaken, photo.latitude, photo.longitude, photo.isCover));
              })
              .catch(e => Promise.resolve(null))
              .then(result => {
                onPhotoDone();
              });
            }
          subscriber.next(trail$);
          onSaved.start();
        }).pipe(
          takeLast(1),
          switchMap(trail$ => trail$),
        )
      ),
      defaultIfEmpty(null),
      tap(() => { if (this._table) this._table.clear(); }),
      catchError(e => {
        Console.error('Error saving recorded trail', e);
        this.errorService.addError(e);
        progress.done();
        return of (null);
      }),
    );
  }

  public takePhoto() {
    this.cameraService.takePhoto().then(photo => this.addPhoto(photo));
  }

  public addPhoto(binary: BinaryContent): void {
    const recording = this._recording$.value;
    if (!recording || !this._table) return;
    const photo = new Photo({
      owner: recording.trail.owner,
      trailUuid: recording.trail.uuid,
      dateTaken: Date.now(),
      index: recording.photos$.value.length + 1,
    }, false, true);
    photo.latitude = recording.track.arrivalPoint?.pos.lat;
    photo.longitude = recording.track.arrivalPoint?.pos.lng;
    const key = 'photo:' + photo.uuid;
    binary.toArrayBuffer().
    then(buffer => this._table?.add({key, photo: buffer}, 'photo:' + photo.uuid))
    .then(() => recording.photos$.next([...recording.photos$.value, photo]));
  }

  public deletePhoto(uuid: string) {
    const recording = this._recording$.value;
    if (!recording) return;
    this._table?.delete('photo:' + uuid);
    recording.photos$.next(recording.photos$.value.filter(p => p.uuid !== uuid));
  }

  public getPhotoFile$(uuid: string): Observable<Blob> {
    if (!this._table) return throwError(() => new Error('Trace recorder not loaded'));
    return from(this._table.get('photo:' + uuid).then(r => r ? Promise.resolve(new Blob([(r as {key: string, photo: ArrayBuffer}).photo], {type: 'image/jpeg'})) : Promise.reject()));
  }

  private _geolocationListener?: (position: PointDto) => void;

  private startRecording(recording: Recording): Promise<Recording> {
    if (!this.i18n.texts) {
      return firstValueFrom(this.i18n.texts$.pipe(filterDefined())).then(() => this.startRecording(recording));
    }
    return this.geolocation.getState()
    .then(state => {
      if (state === GeolocationState.DISABLED) {
        return new Promise((resolve, reject) => {
          this.alertController.create({
            header: this.i18n.texts.trace_recorder.disabled_popup.title,
            message: this.i18n.texts.trace_recorder.disabled_popup.message,
            backdropDismiss: false,
            buttons: [{
              text: this.i18n.texts.buttons.retry,
              role: 'ok',
              handler: () => {
                this.alertController.dismiss();
                this.startRecording(recording).then(resolve).catch(reject);
              }
            }, {
              text: this.i18n.texts.buttons.cancel,
              role: 'cancel',
              handler: () => {
                this.alertController.dismiss();
                reject('Geolocation disabled');
              }
            }]
          }).then(alert => alert.present());
        });
      } else if (state === GeolocationState.DENIED) {
        return Promise.reject('Geolocation access denied by user');
      } else {
        Console.info('Start recording');
        this._recording$.next(recording);
        this._changesSubscription = this.ngZone.runOutsideAngular(() =>
          combineLatest([
            concat(of(true), recording.trail.changes$),
            concat(of(true), recording.track.changes$),
            recording.photos$,
          ])
          .pipe(skip(1), debounceTimeExtended(1000, 5000, 25))
          .subscribe(() => this.save(recording))
        );
        this._geolocationListener = (position: PointDto) => {
          this.ngZone.runOutsideAngular(() => this.newPositionReceived(position, recording));
        }
        this.geolocation.watchPosition(this.i18n.texts.trace_recorder.notif_message, this._geolocationListener);
        this.screenLockService.set(true);
        if (!this.geolocation.isNative && recording.rawTrack.metadata.distance === 0) {
          this.toastController.create({
            message: this.i18n.texts.trace_recorder.not_native_message,
            color: 'warning',
            position: 'bottom',
            duration: 60000,
            swipeGesture: "vertical",
            mode: "ios",
            layout: "stacked",
            buttons: [{
              text: this.i18n.texts.buttons.close,
              role: 'cancel',
            }]
          }).then(t => t.present());
        }
        return Promise.resolve(recording);
      }
    });
  }

  private newPositionReceived(position: PointDto, recording: Recording): void { // NOSONAR
    if (recording.status.latestRawPoint === undefined) {
      // no first point yet => take it
      recording.status.latestRawPoint = this.addRawPoint(recording, position, 'first position received');
      recording.status.latestDefinitiveImprovedPoint = this.addImprovedPoint(recording, position, 'first position received');
      recording.status.points = 1;
      return;
    }
    // raw point
    if (this.takeRawPoint(recording.status.latestRawPoint, position)) {
      recording.status.latestRawPoint = this.addRawPoint(recording, position, 'enough time/distance');
    } else {
      this.updatePoint(recording.status.latestRawPoint, position, 'raw', 'short time/distance');
    }
    // improved track
    if (recording.status.points === 1) {
      if (recording.status.temporaryImprovedPoint === undefined) {
        // second point
        if (this.mustReplace(position, recording.status.latestDefinitiveImprovedPoint!)) {
          this.updatePoint(recording.status.latestDefinitiveImprovedPoint!, position, 'improved', 'accuracy far better for first point');
          return;
        }
        recording.status.temporaryImprovedPoint = this.addImprovedPoint(recording, position, 'second position as temporary');
        return;
      }
      // temporary point is the second point
      if (this.mustReplace(position, recording.status.latestDefinitiveImprovedPoint!)) {
        this.updatePoint(recording.status.latestDefinitiveImprovedPoint!, position, 'improved', 'accuracy far better for first point');
        recording.track.lastSegment.removePoint(recording.status.temporaryImprovedPoint.point);
        recording.status.temporaryImprovedPoint = undefined;
        return;
      }
      if (this.mustReplace(position, recording.status.temporaryImprovedPoint)) {
        this.updatePoint(recording.status.temporaryImprovedPoint, position, 'improved', 'accuracy far better for second point');
        return;
      }
      if (this.takeImprovedPoint(recording.status.latestDefinitiveImprovedPoint!, position)) {
        // enough time/distance from first point => fix the second point
        if (this.takeImprovedPoint(recording.status.temporaryImprovedPoint, position)) {
          // enough time/distance from second point => do not update it
          recording.status.latestDefinitiveImprovedPoint = recording.status.temporaryImprovedPoint;
          recording.status.temporaryImprovedPoint = this.addImprovedPoint(recording, position, 'third point');
          recording.status.points = 2;
          return;
        }
        this.updatePoint(recording.status.temporaryImprovedPoint, position, 'improved', 'update second point before to fix it');
        recording.status.latestDefinitiveImprovedPoint = recording.status.temporaryImprovedPoint;
        recording.status.temporaryImprovedPoint = undefined;
        recording.status.points = 2;
        return;
      }
      // update the second point
      this.updatePoint(recording.status.temporaryImprovedPoint, position, 'improved', 'update second point');
      return;
    }
    // third point ?
    if (recording.status.temporaryImprovedPoint === undefined) {
      recording.status.temporaryImprovedPoint = this.addImprovedPoint(recording, position, 'third position');
      return;
    }
    // at least third point, normal way
    if (this.takeImprovedPoint(recording.status.latestDefinitiveImprovedPoint!, position)) {
      // enough time/distance from previous definitive point => take a new point
      recording.status.latestDefinitiveImprovedPoint = recording.status.temporaryImprovedPoint;
      recording.status.temporaryImprovedPoint = this.addImprovedPoint(recording, position, 'enough time/distance');
      recording.status.points++;
      return;
    }
    // update with best accuracy
    this.updatePoint(recording.status.temporaryImprovedPoint, position, 'improved', 'short distance and time');
  }

  private mustReplace(newPosition: PointDto, previousPosition: RecordingPoint): boolean {
    if (newPosition.pa !== undefined) {
      if (previousPosition.point.posAccuracy === undefined || newPosition.pa < 0.67 * previousPosition.point.posAccuracy)
        return true;
    }
    if (newPosition.ea !== undefined) {
      if (previousPosition.point.eleAccuracy === undefined || newPosition.ea < 0.67 * previousPosition.point.eleAccuracy)
        return true;
    }
    return false;
  }

  private takeRawPoint(previous: RecordingPoint, pos: PointDto): boolean {
    return this.takeImprovedPoint(previous, pos);
  }

  private takeImprovedPoint(previous: RecordingPoint, pos: PointDto): boolean {
    const prefs = this.preferencesService.preferences;
    // do not take points too often, based on prefs.traceMinMillis
    if (prefs.traceMinMillis > 0 && pos.t && previous.point.time && pos.t - previous.point.time < prefs.traceMinMillis) return false;
    // if the direction changes enough, take point, else do not take until prefs.traceMinMeters
    const newAngle = Math.atan2(pos.l! - previous.point.pos.lat, pos.n! - previous.point.pos.lng);
    if ((previous.angle === undefined || Math.abs(newAngle - previous.angle) < 0.1) &&
      (prefs.traceMinMeters > 0 && previous.point.distanceTo({lat: pos.l!, lng: pos.n!}) < prefs.traceMinMeters)
    ) {
      return false;
    }
    return true;
  }

  private addRawPoint(recording: Recording, position: PointDto, reason: string): RecordingPoint {
    Console.info('new raw position', position, reason);
    const point = this.addPointToTrack(position, recording.rawTrack);
    const angle = angleBetween(point, recording.status.latestRawPoint?.point);
    return { point, angle };
  }

  private addImprovedPoint(recording: Recording, position: PointDto, reason: string): RecordingPoint {
    Console.info('new improved position', position, reason);
    const point = this.addPointToTrack(position, recording.track);
    const lastSegment = recording.track.segments[recording.track.segments.length - 1];
    if (lastSegment.points.length > 5 && (lastSegment.points.length % 10) === 0) {
      this.trackEdition.applyDefaultImprovmentsForRecordingSegment(lastSegment, recording.state, false);
      const latestPoint = lastSegment.arrivalPoint!;
      const index = lastSegment.points.indexOf(latestPoint);
      const angle = angleBetween(latestPoint, index === 0 ? undefined : lastSegment.points[index]);
      return { point: latestPoint, angle };
    }
    const previous = lastSegment.points.length <= 1 ? undefined : lastSegment.points[lastSegment.points.length - 2];
    return { point, angle: angleBetween(point, previous) };
  }

  private addPointToTrack(position: PointDto, track: Track): Point {
    const point = {
      pos: { lat: position.l!, lng: position.n! },
      ele: position.e, time: position.t, posAccuracy: position.pa, eleAccuracy: position.ea,
      heading: position.h, speed: position.s
    };
    const segment = track.segments.length === 0 ? track.newSegment() : track.segments[track.segments.length - 1];
    return segment.append(point);
  }

  private updatePoint(point: RecordingPoint, position: PointDto, pointType: string, reason: string): void {
    let updated = false;
    if (this.isBetterAccuracy(position.pa, point.point.posAccuracy)) {
      point.point.pos = new L.LatLng(position.l!, position.n!);
      point.point.posAccuracy = position.pa;
      point.point.heading = position.h;
      point.point.speed = position.s;
      point.angle = angleBetween(point.point, point.point.previousPoint);
      updated = true;
    }
    if (this.isBetterAccuracy(position.ea, point.point.eleAccuracy)) {
      point.point.ele = position.e;
      point.point.eleAccuracy = position.ea;
      updated = true;
    }
    if (updated || (position.t !== undefined && point.point.time === undefined))
      point.point.time = position.t;
    Console.info('update ' + pointType + ' position', position, reason, updated);
  }

  private isBetterAccuracy(newAccuracy: number | undefined, previousAccuracy: number | undefined): boolean {
    if (newAccuracy === undefined) return previousAccuracy === undefined;
    if (previousAccuracy === undefined) return true;
    return newAccuracy < previousAccuracy;
  }

  private stopRecording(recording: Recording): void {
    Console.info('Stop recording');
    this._changesSubscription?.unsubscribe();
    this._changesSubscription = undefined;
    if (this._geolocationListener) this.geolocation.stopWatching(this._geolocationListener);
    this._geolocationListener = undefined;
    if (recording.track.segments.length > 0)
      this.trackEdition.applyDefaultImprovmentsForRecordingSegment(recording.track.segments[recording.track.segments.length - 1], recording.state, true);
    this.screenLockService.set(false);
  }

  private save(recording: Recording): void {
    this.ngZone.runOutsideAngular(() => {
      this._saved = false;
      if (this._saving) return;
      if (!this._table) return;
      const t = this._table;
      this._saving = true;
      this._saved = true;
      this._table.put(recording.toDto(), '1').finally(() => {
        if (this._table !== t) return;
        this._saving = false;
        if (!this._saved) this.save(recording);
      });
    });
  }

}

export class Recording {

  constructor(
    public trail: Trail,
    public track: Track,
    public rawTrack: Track,
    public paused: boolean,
    public state: ImprovmentRecordingState,
    public status: RecordingStatus,
    public photos$: BehaviorSubject<Photo[]>,
    public followingTrailUuid?: string,
    public followingTrailOwner?: string,
    public followingTrackUuid?: string,
  ) {}

  toDto(): RecordingDto {
    return {
      key: '1',
      trail: this.trail.toDto(),
      track: this.track.toDto(),
      rawTrack: this.rawTrack.toDto(),
      paused: this.paused,
      state: this.state.toDto(),
      status: {
        points: this.status.points,
        latestDefinitiveImprovedPoint: this.status.latestDefinitiveImprovedPoint === undefined ? undefined : this.track.lastSegment.points.indexOf(this.status.latestDefinitiveImprovedPoint.point),
        temporaryImprovedPoint: this.status.temporaryImprovedPoint === undefined ? undefined : this.track.lastSegment.points.indexOf(this.status.temporaryImprovedPoint.point),
      },
      photos: this.photos$.value.map(p => p.toDto()),
      followingTrailUuid: this.followingTrailUuid,
      followingTrailOwner: this.followingTrailOwner,
      followingTrackUuid: this.followingTrackUuid,
    }
  }

  static fromDto(dto: RecordingDto, preferencesService: PreferencesService): Recording {
    const rawTrack = new Track(dto.rawTrack, preferencesService);
    const improvedTrack = new Track(dto.track, preferencesService);
    const r = new Recording(
      new Trail(dto.trail),
      improvedTrack,
      rawTrack,
      dto.paused,
      ImprovmentRecordingState.fromDto(dto.state),
      new RecordingStatus(
        dto.status.points,
        rawTrack.segments.length === 0 ? undefined : this.createRecordingPoint(rawTrack.lastSegment, rawTrack.lastSegment.points.length - 1),
        dto.status.latestDefinitiveImprovedPoint === undefined || improvedTrack.segments.length === 0 ? undefined : this.createRecordingPoint(improvedTrack.lastSegment, dto.status.latestDefinitiveImprovedPoint),
        dto.status.temporaryImprovedPoint === undefined || improvedTrack.segments.length === 0 ? undefined : this.createRecordingPoint(improvedTrack.lastSegment, dto.status.temporaryImprovedPoint),
      ),
      new BehaviorSubject<Photo[]>(dto.photos ? dto.photos.map(p => new Photo(p, false, true)) : []),
      dto.followingTrailUuid,
      dto.followingTrailOwner,
      dto.followingTrackUuid,
    );
    return r;
  }

  private static createRecordingPoint(segment: Segment, pointIndex: number): RecordingPoint {
    const point = segment.points[pointIndex];
    const previousPoint = pointIndex === 0 ? undefined : segment.points[pointIndex - 1];
    const angle = angleBetween(point, previousPoint);
    return { point, angle };
  }

}

class RecordingStatus {

  constructor(
    public points: number,
    public latestRawPoint: RecordingPoint | undefined,
    public latestDefinitiveImprovedPoint: RecordingPoint | undefined,
    public temporaryImprovedPoint: RecordingPoint | undefined,
  ) {}

}

interface RecordingPoint {
  point: Point;
  angle?: number;
}


interface RecordingDto {

  key: string;
  trail: TrailDto;
  track: TrackDto;
  rawTrack: TrackDto;
  paused: boolean;
  state: ImprovmentRecordingStateDto,
  status: RecordingStatusDto,
  photos: PhotoDto[] | undefined,
  followingTrailUuid: string | undefined;
  followingTrailOwner: string | undefined;
  followingTrackUuid: string | undefined;

}

interface RecordingStatusDto {
  points: number;
  latestDefinitiveImprovedPoint: number | undefined,
  temporaryImprovedPoint: number | undefined,
}

function angleBetween(currentPoint: Point, previousPoint: Point | undefined): number | undefined {
  return previousPoint === undefined ? undefined : Math.atan2(currentPoint.pos.lat - previousPoint.pos.lat, currentPoint.pos.lng - previousPoint.pos.lng);
}
