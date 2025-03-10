import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, EMPTY, Observable, Subscription, catchError, combineLatest, concat, debounceTime, defaultIfEmpty, map, of, skip, switchMap, timeout, timer } from 'rxjs';
import { TrackDto } from 'src/app/model/dto/track';
import { TrailDto } from 'src/app/model/dto/trail';
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
import L from 'leaflet';
import { GeolocationState } from '../geolocation/geolocation.interface';
import { AlertController } from '@ionic/angular/standalone';
import { ImprovmentRecordingState, TrackEditionService } from '../track-edition/track-edition.service';
import { ProgressService } from '../progress/progress.service';
import { ErrorService } from '../progress/error.service';
import { Console } from 'src/app/utils/console';

@Injectable({
  providedIn: 'root'
})
export class TraceRecorderService {

  private readonly _recording$ = new BehaviorSubject<Recording | null | undefined>(undefined);
  private _db?: Dexie;
  private _table?: Dexie.Table<RecordingDto, number>;
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
    this._table = this._db.table<RecordingDto, number>('record');
    this._table.get(1)
    .then(dto => {
      const recording = dto ? Recording.fromDto(dto, this.preferencesService) : null;
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
          });
          const recording = new Recording(
            trail,
            track,
            rawTrack,
            false,
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

  public pause(): void {
    const recording = this._recording$.value;
    if (!recording) return;
    if (recording.paused) return;
    recording.paused = true;
    this.stopRecording(recording);
    this.save(recording);
  }

  public resume(): Promise<any> {
    const recording = this._recording$.value;
    if (!recording) return Promise.reject(new Error('No current trace'));
    if (!recording.paused) return Promise.reject(new Error('Current trace is not paused'));
    recording.rawTrack.newSegment();
    recording.track.newSegment();
    recording.paused = false;
    this.save(recording);
    return this.startRecording(recording);
  }

  public stop(save: boolean): Observable<Trail | null> {
    const recording = this._recording$.value;
    if (!recording) return of(null);
    this.stopRecording(recording);
    Console.info('Recording stopped');
    this._recording$.next(null);
    if (this._table) this._table.delete(1);
    if (save && this._email) {
      const progress = this.progressService.create(this.i18n.texts.trace_recorder.saving, 5);
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
          this.trackService.create(recording.rawTrack, () => progress.addWorkDone(1));
          this.trackService.create(recording.track, () => progress.addWorkDone(1));
          return this.trailService.create(recording.trail, () => progress.addWorkDone(1));
        }),
        catchError(e => {
          Console.error('Error saving recorded trail', e);
          this.errorService.addError(e);
          progress.done();
          return EMPTY;
        }),
        defaultIfEmpty(null),
      );
    }
    return of(null);
  }

  private _geolocationListener?: (position: PointDto) => void;
  private recordingStatus: RecordingStatus | undefined = undefined;
  private improvmentState: ImprovmentRecordingState | undefined = undefined;

  private startRecording(recording: Recording): Promise<Recording> {
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
            concat(of(true), recording.track.changes$)
          ])
          .pipe(skip(1), debounceTime(1000))
          .subscribe(() => this.save(recording))
        );
        this.recordingStatus = { points: 0, latestRawPoint: undefined, latestDefinitiveImprovedPoint: undefined, temporaryImprovedPoint: undefined };
        this._geolocationListener = (position: PointDto) => {
          this.ngZone.runOutsideAngular(() => this.newPositionReceived(position, recording));
        }
        this.geolocation.watchPosition(this.i18n.texts.trace_recorder.notif_message, this._geolocationListener);
        return Promise.resolve(recording);
      }
    });
  }

  private newPositionReceived(position: PointDto, recording: Recording): void { // NOSONAR
    const status = this.recordingStatus!;
    if (status.latestRawPoint === undefined) {
      // no first point yet => take it
      status.latestRawPoint = this.addRawPoint(recording, position, 'first position received');
      status.latestDefinitiveImprovedPoint = this.addImprovedPoint(recording, position, 'first position received');
      status.points = 1;
      return;
    }
    // raw point
    if (this.takeRawPoint(status.latestRawPoint, position, status.latestRawAngle)) {
      const newPoint = this.addRawPoint(recording, position, 'enough time/distance');
      status.latestRawAngle = status.latestRawPoint ? Math.atan2(newPoint.pos.lat - status.latestRawPoint.pos.lat, newPoint.pos.lng - status.latestRawPoint.pos.lng) : undefined;
      status.latestRawPoint = newPoint;
    } else {
      this.updatePoint(status.latestRawPoint, position, 'raw', 'short time/distance');
    }
    // improved track
    if (status.points === 1) {
      if (status.temporaryImprovedPoint === undefined) {
        // second point
        if (this.mustReplace(position, status.latestDefinitiveImprovedPoint!)) {
          this.updatePoint(status.latestDefinitiveImprovedPoint!, position, 'improved', 'accuracy far better for first point');
          return;
        }
        status.temporaryImprovedPoint = this.addImprovedPoint(recording, position, 'second position as temporary');
        return;
      }
      // temporary point is the second point
      if (this.mustReplace(position, status.latestDefinitiveImprovedPoint!)) {
        this.updatePoint(status.latestDefinitiveImprovedPoint!, position, 'improved', 'accuracy far better for first point');
        recording.track.lastSegment.removePoint(status.temporaryImprovedPoint);
        status.temporaryImprovedPoint = undefined;
        return;
      }
      if (this.mustReplace(position, status.temporaryImprovedPoint)) {
        this.updatePoint(status.temporaryImprovedPoint, position, 'improved', 'accuracy far better for second point');
        return;
      }
      if (this.takeImprovedPoint(status.latestDefinitiveImprovedPoint!, position, undefined)) {
        // enough time/distance from first point => fix the second point
        if (this.takeImprovedPoint(status.temporaryImprovedPoint, position, undefined)) {
          // enough time/distance from second point => do not update it
          status.latestDefinitiveImprovedPoint = status.temporaryImprovedPoint;
          status.temporaryImprovedPoint = this.addImprovedPoint(recording, position, 'third point');
          status.points = 2;
          return;
        }
        this.updatePoint(status.temporaryImprovedPoint, position, 'improved', 'update second point before to fix it');
        status.latestDefinitiveImprovedPoint = status.temporaryImprovedPoint;
        status.temporaryImprovedPoint = undefined;
        status.points = 2;
        return;
      }
      // update the second point
      this.updatePoint(status.temporaryImprovedPoint, position, 'improved', 'update second point');
      return;
    }
    // third point ?
    if (status.temporaryImprovedPoint === undefined) {
      status.temporaryImprovedPoint = this.addImprovedPoint(recording, position, 'third position');
      return;
    }
    // at least third point, normal way
    if (this.takeImprovedPoint(status.latestDefinitiveImprovedPoint!, position, status.latestDefinitiveImprovedAngle)) {
      // enough time/distance from previous definitive point => take a new point
      status.latestDefinitiveImprovedAngle = status.latestDefinitiveImprovedPoint ? Math.atan2(status.temporaryImprovedPoint.pos.lat - status.latestDefinitiveImprovedPoint.pos.lat, status.temporaryImprovedPoint.pos.lng - status.latestDefinitiveImprovedPoint.pos.lng) : undefined;
      status.latestDefinitiveImprovedPoint = status.temporaryImprovedPoint;
      status.temporaryImprovedPoint = this.addImprovedPoint(recording, position, 'enough time/distance');
      status.points++;
      return;
    }
    // update with best accuracy
    this.updatePoint(status.temporaryImprovedPoint, position, 'improved', 'short distance and time');
  }

  private mustReplace(newPosition: PointDto, previousPosition: Point): boolean {
    if (newPosition.pa !== undefined) {
      if (previousPosition.posAccuracy === undefined || newPosition.pa < 0.67 * previousPosition.posAccuracy)
        return true;
    }
    if (newPosition.ea !== undefined) {
      if (previousPosition.eleAccuracy === undefined || newPosition.ea < 0.67 * previousPosition.eleAccuracy)
        return true;
    }
    return false;
  }

  private takeRawPoint(previous: Point, pos: PointDto, previousAngle: number | undefined): boolean {
    return this.takeImprovedPoint(previous, pos, previousAngle);
  }

  private takeImprovedPoint(previous: Point, pos: PointDto, previousAngle: number | undefined): boolean {
    const prefs = this.preferencesService.preferences;
    // do not take points too often, based on prefs.traceMinMillis
    if (prefs.traceMinMillis > 0 && pos.t && previous.time && pos.t - previous.time < prefs.traceMinMillis) return false;
    // if the direction changes enough, take point, else do not take until prefs.traceMinMeters
    const newAngle = Math.atan2(pos.l! - previous.pos.lat, pos.n! - previous.pos.lng);
    if ((previousAngle === undefined || Math.abs(newAngle - previousAngle) < 0.1) &&
      (prefs.traceMinMeters > 0 && previous.distanceTo({lat: pos.l!, lng: pos.n!}) < prefs.traceMinMeters)
    ) {
      return false;
    }
    return true;
  }

  private addRawPoint(recording: Recording, position: PointDto, reason: string): Point {
    Console.info('new raw position', position, reason);
    return this.addPointToTrack(position, recording.rawTrack);
  }

  private addImprovedPoint(recording: Recording, position: PointDto, reason: string): Point {
    Console.info('new improved position', position, reason);
    const point = this.addPointToTrack(position, recording.track);
    const lastSegment = recording.track.segments[recording.track.segments.length - 1];
    if (lastSegment.points.length > 5 && (lastSegment.points.length % 10) === 0)
      this.improvmentState = this.trackEdition.applyDefaultImprovmentsForRecordingSegment(lastSegment, this.improvmentState, false);
    return point;
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

  private updatePoint(point: Point, position: PointDto, pointType: string, reason: string): void {
    let updated = false;
    if (this.isBetterAccuracy(position.pa, point.posAccuracy)) {
      point.pos = new L.LatLng(position.l!, position.n!);
      point.posAccuracy = position.pa;
      point.heading = position.h;
      point.speed = position.s;
      updated = true;
    }
    if (this.isBetterAccuracy(position.ea, point.eleAccuracy)) {
      point.ele = position.e;
      point.eleAccuracy = position.ea;
      updated = true;
    }
    if (updated || (position.t !== undefined && point.time === undefined))
      point.time = position.t;
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
    this.recordingStatus = undefined;
    if (recording.track.segments.length > 0)
      this.trackEdition.applyDefaultImprovmentsForRecordingSegment(recording.track.segments[recording.track.segments.length - 1], this.improvmentState, true);
    this.improvmentState = undefined;
  }

  private save(recording: Recording): void {
    this.ngZone.runOutsideAngular(() => {
      this._saved = false;
      if (this._saving) return;
      if (!this._table) return;
      const t = this._table;
      this._saving = true;
      this._saved = true;
      this._table.put(recording.toDto(), 1).finally(() => {
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
    public followingTrailUuid?: string,
    public followingTrailOwner?: string,
    public followingTrackUuid?: string,
  ) {}

  toDto(): RecordingDto {
    return {
      key: 1,
      trail: this.trail.toDto(),
      track: this.track.toDto(),
      rawTrack: this.rawTrack.toDto(),
      paused: this.paused,
      followingTrailUuid: this.followingTrailUuid,
      followingTrailOwner: this.followingTrailOwner,
      followingTrackUuid: this.followingTrackUuid,
    }
  }

  static fromDto(dto: RecordingDto, preferencesService: PreferencesService): Recording {
    return new Recording(
      new Trail(dto.trail),
      new Track(dto.track, preferencesService),
      new Track(dto.rawTrack, preferencesService),
      dto.paused,
      dto.followingTrailUuid,
      dto.followingTrailOwner,
      dto.followingTrackUuid,
    );
  }

}

interface RecordingDto {

  key: number;
  trail: TrailDto;
  track: TrackDto;
  rawTrack: TrackDto;
  paused: boolean;
  followingTrailUuid: string | undefined;
  followingTrailOwner: string | undefined;
  followingTrackUuid: string | undefined;

}

interface RecordingStatus {

  points: number;
  latestRawPoint?: Point;
  latestRawAngle?: number;
  latestDefinitiveImprovedPoint?: Point;
  latestDefinitiveImprovedAngle?: number;
  temporaryImprovedPoint?: Point;
  temporaryImprovedAngle?: number;

}
