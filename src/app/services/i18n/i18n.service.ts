import { Injectable } from '@angular/core';
import { PreferencesService } from '../preferences/preferences.service';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { environment } from 'src/environments/environment';
import { DateFormat, DistanceUnit, HourFormat } from '../preferences/preferences';
import { StringUtils } from 'src/app/utils/string-utils';
import { AssetsService } from '../assets/assets.service';

const TEXTS_VERSION = '1';

@Injectable({
  providedIn: 'root'
})
export class I18nService {

  private _texts$ = new BehaviorSubject<any>(undefined);
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
      const newState = '' + p.distanceUnit + p.elevationUnit + p.hourFormat + p.dateFormat;
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

  public distanceToString(distance: number): string {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS':
        if (distance < 1000) return distance.toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 1}) + ' m';
        return (distance / 1000).toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 2}) + ' km';
      case 'MILES':
        return this.metersToMiles(distance).toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 3}) + ' mi';
    }
  }

  public distanceInUserUnitToString(distance: number): string {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS':
        if (distance < 1000) return distance.toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 1}) + ' m';
        return (distance / 1000).toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 2}) + ' km';
      case 'MILES':
        return distance.toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 3}) + ' mi';
    }
  }

  public metersToMiles(meters: number): number {
    return meters * 0.00062137119223733;
  }

  public milesToMeters(miles: number): number {
    return miles * 1609.344;
  }

  public distanceInUserUnit(meters: number): number {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return meters;
      case 'MILES': return this.metersToMiles(meters);
    }
  }

  public distanceInMetersFromUserUnit(distance: number): number {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return distance;
      case 'MILES': return this.milesToMeters(distance);
    }
  }

  public shortDistanceUnit(unit: DistanceUnit): string {
    switch (unit) {
      case 'METERS': return 'm';
      case 'MILES': return 'mi';
    }
  }

  public shortUserDistanceUnit(): string {
    return this.shortDistanceUnit(this.prefService.preferences.distanceUnit);
  }

  public getMaxFilterDistance(): number {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return 50000;
      case 'MILES': return 30;
      default: return 1;
    }
  }

  public getFilterDistanceStep(): number {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return 1000;
      case 'MILES': return 1;
      default: return 1;
    }
  }

  public getSpeedString(speed: number) {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return (speed / 1000).toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 1}) + ' km/h';
      case 'MILES': return this.metersToMiles(speed).toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 1}) + ' mi/h';
    }
  }

  public elevationToString(elevation: number): string {
    switch (this.prefService.preferences.elevationUnit) {
      case 'METERS': return elevation.toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 1}) + ' m';
      case 'FOOT': return this.metersToFoot(elevation).toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 0}) + ' ft';
    }
  }

  public elevationInUserUnitToString(elevation: number): string {
    switch (this.prefService.preferences.elevationUnit) {
      case 'METERS': return elevation.toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 1}) + ' m';
      case 'FOOT': return elevation.toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 0}) + ' ft';
    }
  }

  public metersToFoot(meters: number): number {
    return meters * 3.2808398950131;
  }

  public footToMeters(foot: number): number {
    return foot * 0.3048;
  }

  public elevationInUserUnit(meters: number): number {
    switch (this.prefService.preferences.elevationUnit) {
      case 'METERS': return meters;
      case 'FOOT': return this.metersToFoot(meters);
    }
  }

  public elevationInMetersFromUserUnit(elevation: number): number {
    switch (this.prefService.preferences.elevationUnit) {
      case 'METERS': return elevation;
      case 'FOOT': return this.footToMeters(elevation);
    }
  }

  public shortUserElevationUnit(): string {
    switch (this.prefService.preferences.elevationUnit) {
      case 'METERS': return 'm';
      case 'FOOT': return 'ft';
    }
  }

  public shortUserElevationGraphDistanceUnit(): string {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return 'km';
      case 'MILES': return 'mi';
    }
  }

  public elevationGraphDistanceValue(value: number): number {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS': return value / 1000;
      case 'MILES': return value;
    }
  }

  public getMaxFilterElevation(): number {
    switch (this.prefService.preferences.elevationUnit) {
      case 'METERS': return 2000;
      case 'FOOT': return 6500;
      default: return 1;
    }
  }

  public getFilterElevationStep(): number {
    switch (this.prefService.preferences.elevationUnit) {
      case 'METERS': return 50;
      case 'FOOT': return 150;
      default: return 1;
    }
  }

  public durationToString(duration: number): string {
    const minutes = Math.floor(duration / (1000 * 60));
    const days = Math.floor(minutes / (24 * 60));
    const hours = Math.floor((minutes - days * 24 * 60) / 60);
    const min = minutes - (days * 24 * 60) - (hours * 60);
    let minS = min.toString();
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

  public sizeToString(size?: number): string {
    if (size === null || size === undefined) return '';
    if (size < 1024) return size + ' ' + this.texts.bytes.bytes;
    if (size < 1024 * 1024) return Math.floor(size / 1024) + ' ' + this.texts.bytes.kb;
    if (size < 1024 * 1024 * 1024) return Math.floor(size / (1024 * 1024)) + ' ' + this.texts.bytes.mb;
    return Math.floor(size / (1024 * 1024 * 1024)) + ' ' + this.texts.bytes.gb;
  }

  private loadTexts(lang: string): void {
    if (this._textsLoading === lang) return;
    this._textsLoading = lang;
    if (this._textsLoaded$.value === lang) return;
    this.assets.loadText(environment.assetsUrl + '/i18n/' + lang + '.' + TEXTS_VERSION + '.json', true).subscribe(text => {
      const data = JSON.parse(text.innerText);
      this._texts$.next(data);
      console.log('i18n texts loaded for language ', lang);
      document.documentElement.lang = lang;
      this._textsLoaded$.next(lang);
      this._stateChanged$.next(this._stateChanged$.value + 1);
    });
  }

}
