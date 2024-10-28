import { Injectable } from '@angular/core';
import { PreferencesService } from '../preferences/preferences.service';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { DateFormat, DistanceUnit, HourFormat } from '../preferences/preferences';
import { StringUtils } from 'src/app/utils/string-utils';
import { AssetsService } from '../assets/assets.service';
import { Console } from 'src/app/utils/console';

const TEXTS_VERSION = '2';

@Injectable({
  providedIn: 'root'
})
export class I18nService {

  private readonly _texts$ = new BehaviorSubject<any>(undefined);
  private _textsLoading?: string;
  private _textsLoaded$ = new BehaviorSubject<string | undefined>(undefined);

  private _stateChanged$ = new BehaviorSubject<number>(0);

  constructor(
    private prefService: PreferencesService,
    private assets: AssetsService,
  ) {
    let state = '';
    prefService.preferences$.subscribe(p => {
      this.loadTexts(p.lang!);
      const newState = '' + p.distanceUnit + p.hourFormat + p.dateFormat;
      if (newState !== state) {
        state = newState;
        this._stateChanged$.next(this._stateChanged$.value + 1);
      }
    })
  }

  public get texts(): any { return this._texts$.value; }
  public get texts$(): Observable<any> { return this._texts$; }
  public get textsLanguage$(): Observable<string | undefined> { return this._textsLoaded$; }
  public get textsLanguage(): string { return this._textsLoaded$.value || 'en'; }

  public get stateChanged$(): Observable<number> { return this._stateChanged$; }

  public coordToString(latOrLng: number): string {
    return latOrLng.toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 6});
  }

  public distanceToString(distance: number | undefined): string {
    if (distance === undefined) return '';
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return this.metersToMetersOrKilometers(distance);
      case 'IMPERIAL': return this.footToFootOrMiles(this.metersToFoot(distance));
    }
  }

  public distanceInUserUnitToString(distance: number): string {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return this.metersToMetersOrKilometers(distance);
      case 'IMPERIAL': return this.footToFootOrMiles(distance);
    }
  }

  private metersToMetersOrKilometers(meters: number): string {
    if (meters < 1000) return meters.toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 1}) + ' m';
    return (meters / 1000).toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 2}) + ' km';
  }

  private footToFootOrMiles(foot: number): string {
    if (foot >= 5280) return (foot / 5280).toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 3}) + ' mi';
    return foot.toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 1}) + ' ft';
  }

  public metersToFoot(meters: number): number {
    return meters * 3.2808398950131;
  }

  public metersToMiles(meters: number): number {
    return this.footToMiles(this.metersToFoot(meters));
  }

  public footToMeters(foot: number): number {
    return foot * 0.3048;
  }

  public footToMiles(foot: number): number {
    return foot / 5280;
  }

  public milesToFoot(miles: number): number {
    return miles * 5280;
  }

  public milesToMeters(miles: number): number {
    return this.footToMeters(this.milesToFoot(miles));
  }

  public distanceInUserUnit(meters: number): number {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return meters;
      case 'IMPERIAL': return this.metersToFoot(meters);
    }
  }

  public distanceInMetersFromUserUnit(distance: number): number {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return distance;
      case 'IMPERIAL': return this.footToMeters(distance);
    }
  }

  public shortDistanceUnit(unit: DistanceUnit): string {
    switch (unit) {
      case 'METERS': return 'm';
      case 'IMPERIAL': return 'ft';
    }
  }

  public shortUserDistanceUnit(): string {
    return this.shortDistanceUnit(this.prefService.preferences.distanceUnit);
  }

  public getSpeedString(speed?: number): string {
    if (speed === undefined) return '';
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return (speed / 1000).toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 1}) + ' km/h';
      case 'IMPERIAL': return this.footToMiles(this.metersToFoot(speed)).toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 1}) + ' mi/h';
    }
  }

  public elevationToString(elevation: number | undefined): string {
    if (elevation === undefined) return '';
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return elevation.toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 1}) + ' m';
      case 'IMPERIAL': return this.metersToFoot(elevation).toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 0}) + ' ft';
    }
  }

  public elevationInUserUnitToString(elevation: number): string {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return elevation.toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 1}) + ' m';
      case 'IMPERIAL': return elevation.toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 0}) + ' ft';
    }
  }

  public elevationInUserUnit(meters: number): number {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return meters;
      case 'IMPERIAL': return this.metersToFoot(meters);
    }
  }

  public elevationInMetersFromUserUnit(elevation: number): number {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return elevation;
      case 'IMPERIAL': return this.footToMeters(elevation);
    }
  }

  public shortUserElevationUnit(): string {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return 'm';
      case 'IMPERIAL': return 'ft';
    }
  }

  public shortUserElevationGraphDistanceUnit(): string {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return 'km';
      case 'IMPERIAL': return 'mi';
    }
  }

  public elevationGraphDistanceValue(value: number): number {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return value / 1000;
      case 'IMPERIAL': return this.footToMiles(value);
    }
  }

  public durationToString(duration?: number, showZeroHour: boolean = true): string {
    if (duration === undefined) return '';
    const minutes = Math.floor(duration / (1000 * 60));
    const days = Math.floor(minutes / (24 * 60));
    const hours = Math.floor((minutes - days * 24 * 60) / 60);
    const min = minutes - (days * 24 * 60) - (hours * 60);
    let minS = min.toString();
    if (!showZeroHour && hours === 0 && days === 0) return minS + this.texts.duration.minutes;
    if (minS.length < 2) minS = '0' + minS;
    let hourS = hours.toString();
    if (days === 0) return hourS + this.texts.duration.hours + minS;
    if (hourS.length < 2) hourS = '0' + hourS;
    return days.toString() + this.texts.duration.days + hourS + this.texts.duration.hours + minS;
  }

  public hoursToString(hours: number): string {
    return '' + hours + this.texts.duration.hours;
  }

  public timestampToDateTimeString(timestamp?: number): string {
    if (!timestamp) return '';
    return this.timestampToDateString(timestamp) + ' ' + this.timestampToTimeString(timestamp);
  }

  public timestampToDateString(timestamp?: number): string {
    if (!timestamp) return '';
    return this.getDateForFormat(timestamp, this.prefService.preferences.dateFormat);
  }

  public timestampToTimeString(timestamp?: number): string {
    if (!timestamp) return '';
    return this.getTimeForFormat(timestamp, this.prefService.preferences.hourFormat);
  }

  public getDateForFormat(timestamp: number, format: DateFormat): string {
    const date = new Date(timestamp);
    return format
      .replace('dd', StringUtils.padLeft('' + date.getDate(), 2, '0'))
      .replace('mm', StringUtils.padLeft('' + (date.getMonth() + 1), 2, '0'))
      .replace('yyyy', StringUtils.padLeft('' + date.getFullYear(), 4, '0'))
      .replace('d', '' + date.getDate())
      .replace('m', '' + (date.getMonth() + 1))
      ;
  }

  public getTimeForFormat(timestamp: number, format: HourFormat): string {
    const date = new Date(timestamp);
    const h = date.getHours();
    let s = '';
    if (format === 'H12') {
      if (h > 12) {
        s += StringUtils.padLeft('' + (h - 12), 2, '0');
      } else {
        s += StringUtils.padLeft('' + h, 2, '0');
      }
    } else {
      s += StringUtils.padLeft('' + h, 2, '0');
    }
    s += ':';
    s += StringUtils.padLeft('' + date.getMinutes(), 2, '0');
    if (format === 'H12') {
      s += ' ' + (h >= 12 ? 'PM' : 'AM');
    }
    return s;
  }

  public sizeToString(size?: number, kbFractionalDigits?: number, mbFractionalDigits?: number, gbFractionalDigits?: number): string {
    if (size === null || size === undefined) return '';
    if (size < 1024) return size + ' ' + this.texts.bytes.bytes;
    if (size < 1024 * 1024) return (kbFractionalDigits ? (size / 1024).toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: kbFractionalDigits}) : Math.floor(size / 1024)) + ' ' + this.texts.bytes.kb;
    if (size < 1024 * 1024 * 1024) return (mbFractionalDigits ? (size / (1024 * 1024)).toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: mbFractionalDigits}) : Math.floor(size / (1024 * 1024))) + ' ' + this.texts.bytes.mb;
    return (gbFractionalDigits ? (size / (1024 * 1024 * 1024)).toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: gbFractionalDigits}) : Math.floor(size / (1024 * 1024 * 1024))) + ' ' + this.texts.bytes.gb;
  }

  private loadTexts(lang: string): void {
    if (this._textsLoading === lang) return;
    this._textsLoading = lang;
    if (this._textsLoaded$.value === lang) return;
    this.assets.loadJson(environment.assetsUrl + '/i18n/' + lang + '.' + TEXTS_VERSION + '.json').subscribe(data => {
      this._texts$.next(data);
      Console.info('i18n texts loaded for language ', lang);
      document.documentElement.lang = lang;
      this._textsLoaded$.next(lang);
      this._stateChanged$.next(this._stateChanged$.value + 1);
    });
  }

}
