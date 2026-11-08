import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { TraceRecorderService } from '../trace-recorder/trace-recorder.service';
import { LiveGroupService } from '../live-group/live-group.service';
import { GeolocationService } from '../geolocation/geolocation.service';
import { I18nService } from '../i18n/i18n.service';
import { PointDto } from '@trailence/model/dto/point';

@Injectable({providedIn: 'root'})
export class MapShowMyPositionService {

  private readonly _shown$ = new BehaviorSubject<boolean | undefined>(undefined);

  constructor(
    traceRecorder: TraceRecorderService,
    liveGroupService: LiveGroupService,
    private readonly geolocationService: GeolocationService,
    private readonly i18n: I18nService,
  ) {
    combineLatest([traceRecorder.current$, liveGroupService.groups$, liveGroupService.paused$])
    .subscribe(([recording, groups, groupsPaused]) => {
      if (!!recording || (!!groups?.length && !groupsPaused)) this.disable();
      else this.enable();
    });
  }

  public get shown$(): Observable<boolean | undefined> { return this._shown$; }

  private disable(): void {
    this.stop();
    if (this._shown$.value !== undefined) this._shown$.next(undefined);
  }

  private enable(): void {
    if (this._shown$.value === undefined) this._shown$.next(false);
  }

  public toggleShown(): void {
    if (this._shown$.value === undefined) return;
    if (this._shown$.value) this.stop();
    else this.start();
  }

  private watcher?: (position: PointDto) => void;

  private start(): void {
    if (this.watcher) return;
    this.watcher = () => {};
    this.geolocationService.watchPosition(this.i18n.texts.trace_recorder.notif_message, this.watcher);
    this._shown$.next(true);
  }
  private stop(): void {
    if (!this.watcher) return;
    this.geolocationService.stopWatching(this.watcher);
    this.watcher = undefined;
    this._shown$.next(false);
  }

}
