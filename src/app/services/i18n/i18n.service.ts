import { Injectable } from '@angular/core';
import { PreferencesService } from '../preferences/preferences.service';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { environment } from 'src/environments/environment';
import { DateFormat, HourFormat } from '../preferences/preferences';
import { StringUtils } from 'src/app/utils/string-utils';

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

  public get stateChanged$(): Observable<number> { return this._stateChanged$; }

  public distanceToString(distance: number): string {
    switch (this.prefService.preferences.distanceUnit) {
      case 'METERS':
        if (distance < 1000) return distance.toLocaleString(this.prefService.preferences.lang) + ' m';
        return (distance / 1000).toLocaleString(this.prefService.preferences.lang, {maximumFractionDigits: 2}) + ' km';
      case 'MILES':
        return this.metersToMiles(distance).toLocaleString(this.prefService.preferences.lang) + ' mi';
    }
  }

  public metersToMiles(meters: number): number {
    return meters * 0.00062137119223733;
  }

  public elevationToString(elevation: number): string {
    switch (this.prefService.preferences.elevationUnit) {
      case 'METERS': return elevation.toLocaleString(this.prefService.preferences.lang) + ' m';
      case 'FOOT': return this.metersToFoot(elevation).toLocaleString(this.prefService.preferences.lang) + 'ft';
    }
  }

  public metersToFoot(meters: number): number {
    return meters * 0.3048;
  }

  public durationToString(duration: number): string {
    const minutes = Math.floor(duration / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const min = minutes - (hours * 60);
    let minS = min.toString();
    if (minS.length < 2) {
      minS = '0' + minS;
    }
    return hours.toString() + 'h' + minS;
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

  private getDateForFormat(timestamp: number, format: DateFormat): string {
    const date = new Date(timestamp);
    return format
      .replace('dd', StringUtils.padLeft('' + date.getDate(), 2, '0'))
      .replace('mm', StringUtils.padLeft('' + (date.getMonth() + 1), 2, '0'))
      .replace('yyyy', StringUtils.padLeft('' + date.getFullYear(), 4, '0'))
      .replace('d', '' + date.getDate())
      .replace('m', '' + (date.getMonth() + 1))
      ;
  }

  private getTimeForFormat(timestamp: number, format: HourFormat): string {
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

  private loadTexts(lang: string): void {
    if (this._textsLoading === lang) return;
    this._textsLoading = lang;
    if (this._textsLoaded$.value === lang) return;
    const iframe = document.createElement('IFRAME') as HTMLIFrameElement;
    iframe.style.position = 'fixed';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.onload = () => {
      if (this._textsLoading !== lang) return;
      const text = iframe.contentDocument?.documentElement.innerText;
      if (text) {
        const data = JSON.parse(text);
        this._texts$.next(data);
        console.log('i18n texts loaded for language ', lang);
        document.documentElement.lang = lang;
        this._textsLoaded$.next(lang);
        this._stateChanged$.next(this._stateChanged$.value + 1);
      } else {
        console.log('Unable to load i18n texts for language ', lang);
        // TODO
      }
      iframe.parentElement?.removeChild(iframe);
    };
    iframe.onerror = e => {
      console.error('error loading i18n texts for language ', lang, e);
    };
    iframe.src = environment.assetsUrl + '/i18n/' + lang + '.' + TEXTS_VERSION + '.json';
    document.documentElement.appendChild(iframe);
  }

}
