import { Injectable } from '@angular/core';
import { ComputedPreferences, Preferences, ThemeType } from './preferences';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { NetworkService } from '../network/network.service';

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
    combineLatest([network.connected$, authService.auth$, this._saveNeeded$]).subscribe(
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
  }

  private getDefaultLanguage(): string {
    let s = window.navigator.language;
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

  public setOfflineMapMaxZoom(value: number): void {
    this.setPreference('offlineMapMaxZoom', value);
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
