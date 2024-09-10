import { Injectable } from '@angular/core';
import { TraceRecorderService } from '../trace-recorder/trace-recorder.service';
import { GeolocationService } from '../geolocation/geolocation.service';
import { BehaviorSubject, combineLatest, concat, debounceTime, map, Observable, of, switchMap } from 'rxjs';
import { PointDto } from 'src/app/model/dto/point';
import { I18nService } from '../i18n/i18n.service';

@Injectable({providedIn: 'root'})
export class MapGeolocationService {

  private _showPosition = new BehaviorSubject<boolean>(false);

  constructor(
    public recorder: TraceRecorderService,
    private geolocationService: GeolocationService,
    private i18n: I18nService,
  ) {}

  private watch$ = new BehaviorSubject<PointDto | undefined>(undefined);
  private watcher = (position: PointDto) => {
    this.watch$.next(position);
  };
  private watching = false;

  public toggleShowPosition(): void {
    this._showPosition.next(!this._showPosition.value);
  }

  public get showPosition$(): Observable<boolean> {
    return combineLatest([this._showPosition, this.recorder.current$]).pipe(
      map(([show, recording]) => {
        if (recording && !recording.paused) return true;
        return show;
      })
    );
  }

  public get position$(): Observable<{lat: number; lng: number; active: boolean} | undefined> {
    return combineLatest([
      this._showPosition,
      this.geolocationService.waitingForGps$,
      this.recorder.current$.pipe(
        switchMap(r => r ? concat(of(r), r.track.changes$.pipe(map(() => r))) : of(undefined))
      ),
      this.watch$,
    ]).pipe(
      debounceTime(10),
      map(([show, waiting, recording, watch]) => {
        if (recording) {
          if (this.watching) {
            this.watching = false;
            this.geolocationService.stopWatching(this.watcher);
            this.watch$.next(undefined);
          }
          const pt = recording.track.arrivalPoint;
          if (pt) return ({lat: pt.pos.lat, lng: pt.pos.lng, active: !waiting && !recording.paused});
          return undefined;
        }
        if (!show) {
          if (this.watching) {
            this.watching = false;
            this.geolocationService.stopWatching(this.watcher);
            this.watch$.next(undefined);
          }
          return undefined;
        }
        if (!this.watching) {
          this.watching = true;
          this.geolocationService.watchPosition(this.i18n.texts.trace_recorder.notif_message_map, this.watcher);
        }
        if (!watch) return undefined;
        return ({lat: watch.l!, lng: watch.n!, active: !waiting});
      })
    );
  }

}
