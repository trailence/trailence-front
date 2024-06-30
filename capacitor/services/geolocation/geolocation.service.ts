import { Injectable } from '@angular/core';
import { Geolocation, Position } from '@capacitor/geolocation';
import { PointDto } from 'src/app/model/dto/point';
import { GEOLOCATION_MAX_AGE, GEOLOCATION_TIMEOUT, IGeolocationService } from 'src/app/services/geolocation/geolocation.interface';

import {BackgroundGeolocationPlugin, Location} from "@capacitor-community/background-geolocation";
import { registerPlugin } from '@capacitor/core';
import { I18nService } from 'src/app/services/i18n/i18n.service';
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");


@Injectable({
  providedIn: 'root'
})
export class GeolocationService implements IGeolocationService {

  public waitingForGps = false;

  private watchBackgroundId?: string;
  //private watchForegroundId?: string;
  private watchListeners: ({listener: (position: PointDto) => void, onerror?: (error: any) => void})[] = [];

  private options: PositionOptions = {
    enableHighAccuracy: true,
    maximumAge: GEOLOCATION_MAX_AGE,
    timeout: GEOLOCATION_TIMEOUT
  }

  constructor(private i18n: I18nService) { }

  public getCurrentPosition(): Promise<PointDto> {
    return Geolocation.getCurrentPosition(this.options).then(p => this.positionToPointDto(p))
  }

  public watchPosition(
    listener: (position: PointDto) => void,
    onerror?: (error: any) => void
  ): void {
    this.waitingForGps = true;
    this.getCurrentPosition()
    .then(pos => {
      this.waitingForGps = false;
      listener(pos);
    })
    .catch(e => {
      console.log('Geolocation error', e);
      if (onerror) onerror(e);
    });
    this.watchListeners.push({listener, onerror});
    /*
    if (!this.watchForegroundId) {
      Geolocation.watchPosition(this.options, (position, error) => {
        if (error) this.emitError(error);
      })
      .then(id => this.watchForegroundId = id)
      .catch(error => {
        if (onerror) onerror(error);
      })
    }*/
    if (!this.watchBackgroundId) {
      BackgroundGeolocation.addWatcher({
        backgroundMessage: this.i18n.texts.trace_recorder.notif_message,
        backgroundTitle: this.i18n.texts.trace_recorder.notif_title,
        distanceFilter: 1,
      }, (position, err) => {
        console.log('background watcher', position, err);
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
        /*
        Geolocation.clearWatch({id: this.watchForegroundId!}).then();
        this.watchForegroundId = undefined;*/
        this.waitingForGps = false;
      }
    }
  }

  private positionToPointDto(position: Position): PointDto {
    return {
      l: position.coords.latitude,
      n: position.coords.longitude,
      e: position.coords.altitude === null ? undefined : position.coords.altitude,
      t: position.timestamp,
      pa: position.coords.accuracy,
      ea: position.coords.altitudeAccuracy == null ? undefined : position.coords.altitudeAccuracy,
      h: position.coords.heading == null ? undefined : position.coords.heading,
      s: position.coords.speed == null ? undefined : position.coords.speed,
    };
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
    this.waitingForGps = false;
    const dto = this.backgroundLocationToPointDto(position);
    for (const l of this.watchListeners)
      l.listener(dto);
  }

  private emitError(err: any): void {
    console.log('Geolocation error', err);
    this.waitingForGps = true;
    for (const l of this.watchListeners)
      if (l.onerror) l.onerror(err);
  }

}
