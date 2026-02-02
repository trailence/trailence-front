import { Injectable } from '@angular/core';
import { PointDto } from 'src/app/model/dto/point';
import { GEOLOCATION_MAX_AGE, GEOLOCATION_TIMEOUT, GeolocationState, IGeolocationService } from 'src/app/services/geolocation/geolocation.interface';
import { registerPlugin } from '@capacitor/core';
import { BehaviorSubject } from 'rxjs';
import { Console } from 'src/app/utils/console';
import { AlertController } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';

interface WatcherOptions {
    backgroundMessage?: string;
    backgroundTitle?: string;
    requestPermissions?: boolean;
    stale?: boolean;
    distanceFilter?: number;
}

interface Location {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    altitudeAccuracy: number | null;
    simulated: boolean;
    bearing: number | null;
    speed: number | null;
    time: number | null;
}

interface CallbackError extends Error {
    code?: string;
}

interface PermissionStatus {
    location: PermissionState;
    coarseLocation: PermissionState;
}
type GeolocationPermissionType = 'location' | 'coarseLocation';
interface GeolocationPluginPermissions {
    permissions: GeolocationPermissionType[];
}

interface BackgroundGeolocationPlugin {
    addWatcher(
        options: WatcherOptions,
        callback: (
            position?: Location,
            error?: CallbackError
        ) => void
    ): Promise<string>;
    removeWatcher(options: {
        id: string
    }): Promise<void>;
    openSettings(): Promise<void>;
    checkPermissions(): Promise<PermissionStatus>;
    requestPermissions(permissions?: GeolocationPluginPermissions): Promise<PermissionStatus>;
    getCurrentPosition(options: PositionOptions): Promise<Location>;
}


const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

@Injectable({
  providedIn: 'root'
})
export class GeolocationService implements IGeolocationService {

  private readonly _waitingForGps$ = new BehaviorSubject<boolean>(false);

  private watchBackgroundId?: string;
  private readonly watchListeners: ({listener: (position: PointDto) => void, onerror?: (error: any) => void})[] = [];

  private readonly options: PositionOptions = {
    enableHighAccuracy: true,
    maximumAge: GEOLOCATION_MAX_AGE,
    timeout: GEOLOCATION_TIMEOUT
  }

  constructor(
    private readonly alertController: AlertController,
    private readonly i18n: I18nService,
  ) { }

  public readonly isNative = true;
  public get waitingForGps$() { return this._waitingForGps$; }
  public get waitingForGps() { return this._waitingForGps$.value; }

  public getState(): Promise<GeolocationState> {
    return BackgroundGeolocation.checkPermissions()
    .then(result => this.handlePermissions(result))
    .catch(error => {
      Console.error('checkPermissions error', error);
      return Promise.resolve(GeolocationState.DISABLED);
    })
  }

  private handlePermissions(status: PermissionStatus): Promise<GeolocationState> {
    Console.info('checkPermissions status', status);
    if (status.location === 'prompt') {
      return new Promise((resolve, reject) => {
        this.alertController.create({
          header: this.i18n.texts.trace_recorder.disclosure_popup.title,
          message: this.i18n.texts.trace_recorder.disclosure_popup.message,
          buttons: [
            {
              text: this.i18n.texts.trace_recorder.disclosure_popup.button_turnon,
              role: 'success',
              handler: () => {
                this.alertController.dismiss(true, 'success');
              }
            }, {
              text: this.i18n.texts.buttons.cancel,
              role: 'cancel'
            }
          ]
        }).then(a => {
          a.onDidDismiss().then(result => {
            if (result.role === 'success') {
              BackgroundGeolocation.requestPermissions().then(r => this.handlePermissions(r).then(resolve).catch(reject)).catch(reject);
            } else {
              reject();
            }
          });
          a.present();
        });
      });
    } else if (status.location === 'granted') {
      return Promise.resolve(GeolocationState.ENABLED);
    } else {
      return Promise.resolve(GeolocationState.DENIED);
    }
  }

  public getCurrentPosition(): Promise<PointDto> {
    return BackgroundGeolocation.getCurrentPosition(this.options).then(p => this.backgroundLocationToPointDto(p))
  }

  public watchPosition(
    notifMessage: string,
    listener: (position: PointDto) => void,
    onerror?: (error: any) => void
  ): void {
    this._waitingForGps$.next(true);
    this.getCurrentPosition()
    .then(pos => {
      this._waitingForGps$.next(false);
      listener(pos);
    })
    .catch(e => {
      Console.info('Geolocation error', e);
      if (onerror) onerror(e);
    });
    this.watchListeners.push({listener, onerror});
    if (!this.watchBackgroundId) {
      BackgroundGeolocation.addWatcher({
        //backgroundMessage: this.i18n.texts.trace_recorder.notif_message,
        //backgroundTitle: this.i18n.texts.trace_recorder.notif_title,
        backgroundMessage: '',
        backgroundTitle: notifMessage,
        distanceFilter: 1,
      }, (position, err) => {
        Console.info('background watcher', position, err);
        if (position) {
          this.emitPosition(position);
        } else if (err) {
          this.emitError(err);
        }
      })
      .then(id => this.watchBackgroundId = id);
    }
  }

  public stopWatching(listener: (position: PointDto) => void): void {
    const index = this.watchListeners.findIndex(l => l.listener === listener);
    if (index >= 0) {
      this.watchListeners.splice(index, 1);
      if (this.watchListeners.length === 0) {
        BackgroundGeolocation.removeWatcher({id: this.watchBackgroundId!}).then();
        this.watchBackgroundId = undefined;
        this._waitingForGps$.next(false);
      }
    }
  }

  private backgroundLocationToPointDto(position: Location): PointDto {
    return {
      l: position.latitude,
      n: position.longitude,
      e: position.altitude === null ? undefined : position.altitude,
      t: position.time === null ? undefined : position.time,
      pa: position.accuracy,
      ea: position.altitudeAccuracy === null ? undefined : position.altitudeAccuracy,
      h: position.bearing === null ? undefined : position.bearing,
      s: position.speed === null ? undefined : position.speed,
    }
  }

  private emitPosition(position: Location): void {
    this._waitingForGps$.next(false);
    const dto = this.backgroundLocationToPointDto(position);
    for (const l of this.watchListeners)
      l.listener(dto);
  }

  private emitError(err: any): void {
    Console.info('Geolocation error', err);
    this._waitingForGps$.next(true);
    for (const l of this.watchListeners)
      if (l.onerror) l.onerror(err);
  }

}
