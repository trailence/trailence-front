import { Injectable } from '@angular/core';
import { ComputedPreferences, DateFormat, DistanceUnit, ElevationUnit, HourFormat, Preferences, ThemeType } from './preferences';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { NetworkService } from '../network/network.service';
import { StringUtils } from 'src/app/utils/string-utils';

const defaultPreferences: {[key:string]: Preferences} = {
  'en': {
    lang: 'en',
    elevationUnit: 'FOOT',
    distanceUnit: 'MILES',
    hourFormat: 'H12',
    dateFormat: 'm/d/yyyy'
  },
  'fr': {
    lang: 'fr',
    elevationUnit: 'METERS',
    distanceUnit: 'METERS',
    hourFormat: 'H24',
    dateFormat: 'dd/mm/yyyy'
  },
}

const LOCALSTORAGE_PREFERENCES_KEY = 'trailence.preferences';

const DEFAULT_TRACE_MIN_METERS = 5;
const DEFAULT_TRACE_MIN_MILLIS = 5000;

const DEFAULT_OFFLINE_MAP_MAX_KEEP_DAYS = 60;
const DEFAULT_OFFLINE_MAP_MAX_ZOOM = 16;

const DEFAULT_ESTIMATED_BASE_SPEED = 5000;
const DEFAULT_LONG_BREAK_MINIMUM_DURATION = 5 * 60 * 1000;
const DEFAULT_LONG_BREAK_MAXIMUM_DISTANCE = 50;

@Injectable({
  providedIn: 'root'
})
export class PreferencesService {

  private _prefs$: BehaviorSubject<Preferences>;
  private _computed$: BehaviorSubject<ComputedPreferences>;
  private _systemTheme: ThemeType;
  private _saveNeeded$ = new BehaviorSubject<string | undefined>(undefined);

  constructor(
    private authService: AuthService,
    private httpService: HttpService,
    private network: NetworkService,
  ) {
    this._systemTheme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'DARK' : 'LIGHT';
    let prefs: Preferences = {};
    try {
      const stored = localStorage.getItem(LOCALSTORAGE_PREFERENCES_KEY);
      if (stored) {
        prefs = JSON.parse(stored) as Preferences;
      }
    } catch (e) {}
    this._prefs$ = new BehaviorSubject<Preferences>(prefs);
    authService.auth$.subscribe(auth => {
      if (auth?.preferences) {
        const prefs = {...auth.preferences};
        this.complete(prefs, this._prefs$.value);
        this._prefs$.next(prefs);
      }
    });
    this._computed$ = new BehaviorSubject<ComputedPreferences>(this.compute(this._prefs$.value));
    this._prefs$.subscribe(p => {
      localStorage.setItem(LOCALSTORAGE_PREFERENCES_KEY, JSON.stringify(p));
      const computed = this.compute(p);
      console.log('Preferences: ', computed);
      window.document.body.classList.remove('dark-theme');
      window.document.body.classList.remove('light-theme');
      const theme = computed.theme === 'SYSTEM' ? this._systemTheme : computed.theme;
      window.document.body.classList.add(theme.toLowerCase() + '-theme');
      this._computed$.next(computed);
    });
    combineLatest([network.server$, authService.auth$, this._saveNeeded$]).subscribe(
      ([connected, auth, saveNeeded]) => {
        if (connected && auth?.preferences && saveNeeded === auth?.email) {
          this.httpService.put(environment.apiBaseUrl + '/preferences/v1', auth.preferences).subscribe();
        }
      }
    );
  }

  private compute(p: Preferences): ComputedPreferences {
    const result = {...p};
    if (!result.lang || !defaultPreferences[result.lang])
      result.lang = this.getDefaultLanguage();
    this.complete(result, defaultPreferences[result.lang]);
    if (!result.theme) result.theme = 'SYSTEM';
    return result as ComputedPreferences;
  }

  private complete(toComplete: Preferences, withPrefs: Preferences): void {
    if (!toComplete.lang) toComplete.lang = withPrefs.lang;
    if (!toComplete.elevationUnit) toComplete.elevationUnit = withPrefs.elevationUnit;
    if (!toComplete.distanceUnit) toComplete.distanceUnit = withPrefs.distanceUnit;
    if (!toComplete.hourFormat) toComplete.hourFormat = withPrefs.hourFormat;
    if (!toComplete.dateFormat) toComplete.dateFormat = withPrefs.dateFormat;
    if (toComplete.traceMinMeters === undefined || toComplete.traceMinMeters === null) toComplete.traceMinMeters = DEFAULT_TRACE_MIN_METERS;
    if (toComplete.traceMinMillis === undefined || toComplete.traceMinMillis === null) toComplete.traceMinMillis = DEFAULT_TRACE_MIN_MILLIS;
    if (toComplete.offlineMapMaxKeepDays === undefined || toComplete.offlineMapMaxKeepDays === null) toComplete.offlineMapMaxKeepDays = DEFAULT_OFFLINE_MAP_MAX_KEEP_DAYS;
    if (toComplete.offlineMapMaxZoom === undefined || toComplete.offlineMapMaxZoom === null) toComplete.offlineMapMaxZoom = DEFAULT_OFFLINE_MAP_MAX_ZOOM;
    if (toComplete.estimatedBaseSpeed === undefined || toComplete.estimatedBaseSpeed === null) toComplete.estimatedBaseSpeed = DEFAULT_ESTIMATED_BASE_SPEED;
    if (toComplete.longBreakMinimumDuration === undefined || toComplete.longBreakMinimumDuration === null) toComplete.longBreakMinimumDuration = DEFAULT_LONG_BREAK_MINIMUM_DURATION;
    if (toComplete.longBreakMaximumDistance === undefined || toComplete.longBreakMaximumDistance === null) toComplete.longBreakMaximumDistance = DEFAULT_LONG_BREAK_MAXIMUM_DISTANCE;
  }

  private getDefaultLanguage(): string {
    let s = window.location.search;
    if (s.length > 0) {
      const params = StringUtils.parseQueryParams(s);
      if (params['lang']) {
        if (defaultPreferences[params['lang']]) {
          return params['lang'];
        }
      }
    }
    s = window.navigator.language;
    if (s) {
      if (s.length > 2) s = s.substring(0, 2);
      s = s.toLowerCase();
      if (defaultPreferences[s]) {
        return s;
      }
    }
    for (s in window.navigator.languages) {
      if (s.length > 2) s = s.substring(0, 2);
      s = s.toLowerCase();
      if (defaultPreferences[s]) {
        return s;
      }
    }
    return 'en';
  }

  public get preferences$(): Observable<ComputedPreferences> { return this._computed$ };
  public get preferences(): ComputedPreferences { return this._computed$.value; }

  public setLanguage(lang: string): void {
    if (!defaultPreferences[lang]) return;
    const auth = this.authService.auth;
    if (auth && auth.preferences?.lang !== lang) {
      if (!auth.preferences) {
        auth.preferences = {};
      }
      auth.preferences.lang = lang;
      this.authService.preferencesUpdated();
      this._saveNeeded$.next(auth.email);
    }
    if (this._prefs$.value.lang !== lang) {
      this._prefs$.value.lang = lang;
      this._prefs$.next(this._prefs$.value);
    }
  }

  public setTheme(theme: ThemeType): void {
    this.setPreference('theme', theme);
  }

  public setDistanceUnit(unit?: DistanceUnit): void {
    this.setPreference('distanceUnit', unit);
  }

  public setElevationUnit(unit?: ElevationUnit): void {
    this.setPreference('elevationUnit', unit);
  }

  public setDateFormat(format?: DateFormat): void {
    this.setPreference('dateFormat', format);
  }

  public setHourFormat(format?: HourFormat): void {
    this.setPreference('hourFormat', format);
  }

  public setTraceMinMeters(meters: number): void {
    this.setPreference('traceMinMeters', meters);
  }

  public setTraceMinMillis(millis: number): void {
    this.setPreference('traceMinMillis', millis);
  }

  public setOfflineMapMaxZoom(value: number): void {
    this.setPreference('offlineMapMaxZoom', value);
  }

  public setOfflineMapMaxKeepDays(value: number): void {
    this.setPreference('offlineMapMaxkeepDays', value);
  }

  public setEstimatedBaseSpeed(value: number): void {
    this.setPreference('estimatedBaseSpeed', value);
  }

  public setLongBreakMinimumDuration(value: number): void {
    this.setPreference('longBreakMinimumDuration', value);
  }

  public setLongBreakMaximumDistance(value: number): void {
    this.setPreference('longBreakMaximumDistance', value);
  }

  private setPreference(field: string, value: any): void {
    const auth = this.authService.auth;
    if (auth) {
      const currentValue = auth && auth.preferences ? (auth.preferences as any)[field] : undefined;
      if (auth && currentValue !== value) {
        if (!auth.preferences) {
          auth.preferences = {};
        }
        (auth.preferences as any)[field] = value;
        this.authService.preferencesUpdated();
        this._saveNeeded$.next(auth.email);
      }
      }
    if ((this._prefs$.value as any)[field] !== value) {
      (this._prefs$.value as any)[field] = value;
      this._prefs$.next(this._prefs$.value);
    }
  }

}
