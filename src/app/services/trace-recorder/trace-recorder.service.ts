import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subscription, combineLatest, concat, of, skip, timeout } from 'rxjs';
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
import * as L from 'leaflet';
import { applyElevationThresholdToSegment } from '../track-edition/elevation/elevation-threshold';

@Injectable({
  providedIn: 'root'
})
export class TraceRecorderService {

  private _recording$ = new BehaviorSubject<Recording | null | undefined>(undefined);
  private _db?: Dexie;
  private _table?: Dexie.Table<RecordingDto, number>;
  private _email?: string;
  private _saving = false;
  private _saved = true;
  private _changesSubscription?: Subscription;

  constructor(
    auth: AuthService,
    private i18n: I18nService,
    private collectionService: TrailCollectionService,
    private geolocation: GeolocationService,
    private preferencesService: PreferencesService,
    private trackService: TrackService,
    private trailService: TrailService,
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
    this._email = email;
    this._db = new Dexie('trailence_record_' + email);
    const storesV1: any = {};
    storesV1['record'] = 'key';
    this._db.version(1).stores(storesV1);
    this._table = this._db.table<RecordingDto, number>('record');
    this._table.get(1)
    .then(dto => {
      const recording = dto ? Recording.fromDto(dto) : null;
      this._recording$.next(recording);
      if (recording && !recording.paused) this.startRecording();
    })
    .catch(e => {
      console.error(e);
      this._recording$.next(null);
    });
  }

  public start(following?: Trail): Promise<Recording> {
    if (!this._email) return Promise.reject();
    return new Promise<Recording>((resolve, reject) => {
      this.collectionService.getMyTrails$().pipe(timeout(30000)).subscribe({
        next: myTrails => {
          if (!this._email) { reject(); return; }
          const track = new Track({ owner: this._email });
          const rawTrack = new Track({ owner: this._email });
          const trail = new Trail({
            owner: this._email,
            name: this.i18n.texts.trace_recorder.trail_name_start + ' ' + this.i18n.timestampToDateTimeString(Date.now()),
            collectionUuid: myTrails!.uuid,
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
          this._recording$.next(recording);
          resolve(recording);
          this.startRecording();
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

  public resume(): void {
    const recording = this._recording$.value;
    if (!recording) return;
    if (!recording.paused) return;
    recording.rawTrack.newSegment();
    recording.track.newSegment();
    recording.paused = false;
    this.startRecording();
    this.save(recording);
  }

  public stop(save: boolean): Observable<Trail | null> {
    const recording = this._recording$.value;
    if (!recording) return of(null);
    this.stopRecording(recording);
    console.log('Recording stopped');
    this._recording$.next(null);
    if (this._table) this._table.delete(1);
    if (save && this._email) {
      recording.rawTrack.removeEmptySegments();
      recording.track.removeEmptySegments();
      if (recording.rawTrack.segments.length === 0) return of(null);
      this.trackService.create(recording.rawTrack);
      this.trackService.create(recording.track);
      return this.trailService.create(recording.trail)
    }
    return of(null);
  }

  private _geolocationListener?: (position: PointDto) => void;
  private latestDefinitivePoint: Point[] | undefined = undefined;
  private latestTemporaryPoint: Point[] | undefined = undefined;

  private startRecording(): void {
    const recording = this._recording$.value;
    if (!recording) return;
    console.log('Start recording');
    this._changesSubscription = combineLatest([
      concat(of(true), recording.trail.changes$),
      concat(of(true), recording.track.changes$)
    ])
    .pipe(skip(1))
    .subscribe(() => this.save(recording));
    this.latestDefinitivePoint = undefined;
    this.latestTemporaryPoint = undefined;
    this._geolocationListener = (position: PointDto) => {
      // always keep latest position, but replace previous one if minimum distance or minimum time is not reached
      if (this.latestDefinitivePoint === undefined) {
        this.latestDefinitivePoint = this.addPoint(recording, position);
      } else if (this.takePoint(this.latestDefinitivePoint[0], position)) {
        if (this.latestTemporaryPoint === undefined) {
          // if previous definitive point has low accuracy, replace it
          if (position.pa &&
            position.t && (this.latestDefinitivePoint[0].time === undefined || position.t - this.latestDefinitivePoint[0].time <= 5000) &&
            (this.latestDefinitivePoint[0].posAccuracy === undefined || this.latestDefinitivePoint[0].posAccuracy >= position.pa * 2)) {
            this.updatePoints(position, this.latestDefinitivePoint);
          } else {
            this.latestDefinitivePoint = this.addPoint(recording, position);
          }
        } else {
          this.updatePoints(position, this.latestTemporaryPoint);
          this.latestDefinitivePoint = this.latestTemporaryPoint;
          this.latestTemporaryPoint = undefined;
        }
      } else {
        if (this.latestTemporaryPoint === undefined) {
          this.latestTemporaryPoint = this.addPoint(recording, position);
        } else {
          this.updatePoints(position, this.latestTemporaryPoint);
        }
      }
    }
    this.geolocation.watchPosition(this._geolocationListener);
  }

  private takePoint(previous: Point, pos: PointDto): boolean {
    const prefs = this.preferencesService.preferences;
    if (prefs.traceMinMeters > 0 && previous.distanceTo({lat: pos.l!, lng: pos.n!}) < prefs.traceMinMeters) return false;
    if (prefs.traceMinMillis > 0 && pos.t && previous.time && pos.t - previous.time < prefs.traceMinMillis) return false;
    return true;
  }

  private addPoint(recording: Recording, position: PointDto): Point[] {
    console.log('new position', position);
    const points = [
      this.addPointToTrack(position, recording.rawTrack),
      this.addPointToTrack(position, recording.track),
    ];
    applyElevationThresholdToSegment(recording.track.segments[recording.track.segments.length - 1], 10);
    return points;
  }

  private addPointToTrack(position: PointDto, track: Track): Point {
    const point = new Point(
      position.l!, position.n!, position.e, position.t, position.pa, position.ea, position.h, position.s
    );
    const segment = track.segments.length === 0 ? track.newSegment() : track.segments[track.segments.length - 1];
    segment.append(point);
    return point;
  }

  private updatePoints(position: PointDto, points: Point[]): void {
    console.log('update position', position);
    this.updatePoint(points[0], position);
    this.updatePoint(points[1], position);
  }

  private updatePoint(point: Point, position: PointDto): void {
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
    if (updated)
      point.time = position.t;
  }

  private isBetterAccuracy(newAccuracy: number | undefined, previousAccuracy: number | undefined): boolean {
    if (newAccuracy === undefined) return previousAccuracy === undefined;
    if (previousAccuracy === undefined) return true;
    return newAccuracy <= previousAccuracy;
  }

  private stopRecording(recording: Recording): void {
    console.log('Stop recording');
    this._changesSubscription?.unsubscribe();
    this._changesSubscription = undefined;
    if (this._geolocationListener) this.geolocation.stopWatching(this._geolocationListener);
    this._geolocationListener = undefined;
    this.latestDefinitivePoint = undefined;
    this.latestTemporaryPoint = undefined;
  }

  private save(recording: Recording): void {
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

  static fromDto(dto: RecordingDto): Recording {
    return new Recording(
      new Trail(dto.trail),
      new Track(dto.track),
      new Track(dto.rawTrack),
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
