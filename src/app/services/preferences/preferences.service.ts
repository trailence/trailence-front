import { Injectable, Injector, OnDestroy } from '@angular/core';
import { ComputedPreferences, DateFormat, DistanceUnit, HourFormat, Preferences, ThemeType } from './preferences';
import { BehaviorSubject, Observable, Subscription, combineLatest, debounceTime } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { NetworkService } from '../network/network.service';
import { StringUtils } from 'src/app/utils/string-utils';
import { Console } from 'src/app/utils/console';

const defaultPreferences: {[key:string]: Preferences} = {
  'en': {
    lang: 'en',
    distanceUnit: 'IMPERIAL',
    hourFormat: 'H12',
    dateFormat: 'm/d/yyyy'
  },
  'fr': {
    lang: 'fr',
    distanceUnit: 'METERS',
    hourFormat: 'H24',
    dateFormat: 'dd/mm/yyyy'
  },
}

const LOCALSTORAGE_PREFERENCES_KEY = 'trailence.preferences';

const DEFAULT_TRACE_MIN_METERS = 3;
const DEFAULT_TRACE_MIN_MILLIS = 5000;

const DEFAULT_OFFLINE_MAP_MAX_KEEP_DAYS = 300;
const DEFAULT_OFFLINE_MAP_MAX_ZOOM = 16;

const DEFAULT_ESTIMATED_BASE_SPEED = 5000;
const DEFAULT_LONG_BREAK_MINIMUM_DURATION = 5 * 60 * 1000;
const DEFAULT_LONG_BREAK_MAXIMUM_DISTANCE = 50;

const DEFAULT_PHOTO_MAX_PIXELS = 600;
const DEFAULT_PHOTO_MAX_QUALITY = 75;
const DEFAULT_PHOTO_MAX_SIZE = 500;
const DEFAULT_PHOTO_CACHE_DAYS = 300;

@Injectable({
  providedIn: 'root'
})
export class PreferencesService implements OnDestroy {

  private readonly _prefs$: BehaviorSubject<Preferences>;
  private readonly _computed$: BehaviorSubject<ComputedPreferences>;
  private readonly _systemTheme: 'DARK' | 'LIGHT';
  private readonly _saveNeeded$ = new BehaviorSubject<string | undefined>(undefined);
  private destroyed = false;
  private subscription?: Subscription;

  constructor(
    private readonly injector: Injector,
  ) {
    this._systemTheme = (globalThis.matchMedia('(prefers-color-scheme: dark)').matches) ? 'DARK' : 'LIGHT';
    let prefs: Preferences = {};
    try {
      const stored = localStorage.getItem(LOCALSTORAGE_PREFERENCES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        prefs = {
          lang: parsed['lang'],
          distanceUnit: parsed['distanceUnit'],
          hourFormat: parsed['hourFormat'],
          dateFormat: parsed['dateFormat'],
          theme: parsed['theme'],
          traceMinMeters: parsed['traceMinMeters'],
          traceMinMillis: parsed['traceMinMillis'],
          offlineMapMaxKeepDays: parsed['offlineMapMaxKeepDays'],
          offlineMapMaxZoom: parsed['offlineMapMaxZoom'],
          estimatedBaseSpeed: parsed['estimatedBaseSpeed'],
          longBreakMinimumDuration: parsed['longBreakMinimumDuration'],
          longBreakMaximumDistance: parsed['longBreakMaximumDistance'],
          photoMaxPixels: parsed['photoMaxPixels'],
          photoMaxQuality: parsed['photoMaxQuality'],
          photoMaxSizeKB: parsed['photoMaxSizeKB'],
          photoCacheDays: parsed['photoCacheDays'],
          alias: parsed['alias'] ?? '',
        }
      }
    } catch (e) {} // NOSONAR
    this._prefs$ = new BehaviorSubject<Preferences>(prefs);
    this._computed$ = new BehaviorSubject<ComputedPreferences>(this.compute(this._prefs$.value));
    Console.info('Initial preferences: ', this._computed$.value);
    setTimeout(() => this.init(), 1);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.subscription?.unsubscribe();
  }

  private init(): void {
    if (this.destroyed) return;
    this._prefs$.pipe(debounceTime(10)).subscribe(p => {
      localStorage.setItem(LOCALSTORAGE_PREFERENCES_KEY, JSON.stringify(p));
      const computed = this.compute(p);
      Console.info('Preferences: ', computed);
      globalThis.document.body.classList.remove('dark-theme', 'light-theme');
      const theme = computed.theme === 'SYSTEM' ? this._systemTheme : computed.theme;
      globalThis.document.body.classList.add(theme.toLowerCase() + '-theme');
      this._computed$.next(computed);
    });
    this.injector.get(AuthService).auth$.subscribe(auth => {
      if (auth?.preferences) {
        Console.info("Preferences from login", auth.preferences);
        const prefs = {...auth.preferences};
        this.complete(prefs, this._prefs$.value);
        this._prefs$.next(prefs);
      }
    });
    this.subscription = combineLatest([this.injector.get(NetworkService).server$, this.injector.get(AuthService).auth$, this._saveNeeded$]).subscribe(
      ([connected, auth, saveNeeded]) => {
        if (connected && auth?.preferences && saveNeeded === auth?.email && !auth?.isAnonymous) {
          const body = {...auth.preferences};
          this.injector.get(HttpService).put(environment.apiBaseUrl + '/preferences/v1', body).subscribe(() => {
            Console.info('Preferences saved for user', body);
          });
        }
      }
    );
  }

  private compute(p: Preferences): ComputedPreferences {
    const result = {...p};
    if (!result.lang || !defaultPreferences[result.lang])
      result.lang = this.getDefaultLanguage();
    this.complete(result, defaultPreferences[result.lang]);
    result.theme ??= 'SYSTEM';
    return result as ComputedPreferences;
  }

  private complete(toComplete: Preferences, withPrefs: Preferences): void { // NOSONAR
    toComplete.lang ??= withPrefs.lang;
    toComplete.distanceUnit = this.completeEnum(toComplete.distanceUnit, withPrefs.distanceUnit, ['METERS', 'IMPERIAL']);
    toComplete.hourFormat = this.completeEnum(toComplete.hourFormat, withPrefs.hourFormat, ['H12', 'H24'])
    toComplete.dateFormat = this.completeEnum(toComplete.dateFormat, withPrefs.dateFormat, ['m/d/yyyy', 'dd/mm/yyyy'])
    toComplete.traceMinMeters ??= DEFAULT_TRACE_MIN_METERS;
    toComplete.traceMinMillis ??= DEFAULT_TRACE_MIN_MILLIS;
    toComplete.offlineMapMaxKeepDays ??= DEFAULT_OFFLINE_MAP_MAX_KEEP_DAYS;
    toComplete.offlineMapMaxZoom ??= DEFAULT_OFFLINE_MAP_MAX_ZOOM;
    toComplete.estimatedBaseSpeed ??= DEFAULT_ESTIMATED_BASE_SPEED;
    toComplete.longBreakMinimumDuration ??= DEFAULT_LONG_BREAK_MINIMUM_DURATION;
    toComplete.longBreakMaximumDistance ??= DEFAULT_LONG_BREAK_MAXIMUM_DISTANCE;
    toComplete.photoMaxPixels ??= DEFAULT_PHOTO_MAX_PIXELS;
    toComplete.photoMaxQuality ??= DEFAULT_PHOTO_MAX_QUALITY;
    toComplete.photoMaxSizeKB ??= DEFAULT_PHOTO_MAX_SIZE;
    toComplete.photoCacheDays ??= DEFAULT_PHOTO_CACHE_DAYS;
    toComplete.alias ??= '';
  }

  private completeEnum<T>(value: string | undefined, defaultValue: T, allowedValues: string[]): T {
    if (value === undefined) return defaultValue;
    if (allowedValues.includes(value)) return value as T;
    return defaultValue;
  }

  private getDefaultLanguage(): string {
    let s = globalThis.location.search;
    if (s.length > 0) {
      const params = StringUtils.parseQueryParams(s);
      if (params['lang'] && defaultPreferences[params['lang']]) {
        return params['lang'];
      }
    }
    s = globalThis.navigator.language;
    if (s) {
      if (s.length > 2) s = s.substring(0, 2);
      s = s.toLowerCase();
      if (defaultPreferences[s]) {
        return s;
      }
    }
    for (s in globalThis.navigator.languages) {
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
    const authService = this.injector.get(AuthService);
    const auth = authService.auth;
    if (auth && auth.preferences?.lang !== lang) {
      auth.preferences ??= {};
      auth.preferences.lang = lang;
      authService.preferencesUpdated();
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
    this.setPreference('offlineMapMaxKeepDays', value);
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

  public setPhotoMaxPixels(value: number): void {
    this.setPreference('photoMaxPixels', value);
  }

  public setPhotoMaxQuality(value: number): void {
    this.setPreference('photoMaxQuality', value);
  }

  public setPhotoMaxSizeKB(value: number): void {
    this.setPreference('photoMaxSizeKB', value);
  }

  public setPhotoCacheDays(value: number): void {
    this.setPreference('photoCacheDays', value);
  }

  public setAlias(value: string): void {
    this.setPreference('alias', value);
  }

  private setPreference(field: string, value: any): void {
    const authService = this.injector.get(AuthService);
    const auth = authService.auth;
    if (auth) {
      const currentValue = auth?.preferences ? (auth.preferences as any)[field] : undefined;
      if (currentValue !== value) {
        auth.preferences ??= {};
        (auth.preferences as any)[field] = value;
        authService.preferencesUpdated();
        if (!auth.isAnonymous)
          this._saveNeeded$.next(auth.email);
      }
    }
    if ((this._prefs$.value as any)[field] !== value) {
      (this._prefs$.value as any)[field] = value;
      this._prefs$.next(this._prefs$.value);
    }
  }

  public resetAll(): void {
    const authService = this.injector.get(AuthService);
    const auth = authService.auth;
    if (auth) {
      auth.preferences = {};
      authService.preferencesUpdated();
      if (!auth.isAnonymous)
        this._saveNeeded$.next(auth.email);
    }
    this._prefs$.next({});
  }

  public getResolvedTheme(): 'DARK' | 'LIGHT' {
    switch (this.preferences.theme) {
      case 'DARK': return 'DARK';
      case 'LIGHT': return 'LIGHT';
      default: return this._systemTheme;
    }
  }

}
