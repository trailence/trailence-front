import { Injectable, Injector, OnDestroy } from '@angular/core';
import { ComputedPreferences, DateFormat, DistanceUnit, Filters, HourFormat, Preferences, ThemeType } from './preferences';
import { BehaviorSubject, Observable, Subscription, combineLatest, debounceTime } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { HttpService } from '../http/http.service';
import { environment } from '@env/environment';
import { NetworkService } from '../network/network.service';
import { StringUtils } from '@trailence/utils/string-utils';
import Trailence from '../trailence.service';
import { I18nService } from '../i18n/i18n.service';
import { FiltersUtils } from '@trailence/components/trails-list/filters';
import { DEFAULT_LOCALE_KEY, LocaleKey, toLocaleKey } from '../i18n/available-locales';
import { getLogger } from '@trailence/utils/console';

const logger = getLogger('preferences.service');

const defaultPreferences: {[key in LocaleKey]: Preferences} = {
  'de': {
    lang: 'de',
    distanceUnit: 'METERS',
    hourFormat: 'H24',
    dateFormat: 'dd.mm.yyyy'
  },
  'en': {
    lang: 'en',
    distanceUnit: 'METERS',
    hourFormat: 'H12',
    dateFormat: 'm/d/yyyy'
  },
  'es': {
    lang: 'es',
    distanceUnit: 'METERS',
    hourFormat: 'H24',
    dateFormat: 'dd/mm/yyyy'
  },
  'fr': {
    lang: 'fr',
    distanceUnit: 'METERS',
    hourFormat: 'H24',
    dateFormat: 'dd/mm/yyyy'
  },
  'it': {
    lang: 'it',
    distanceUnit: 'METERS',
    hourFormat: 'H24',
    dateFormat: 'dd/mm/yyyy'
  },
  'pt': {
    lang: 'pt',
    distanceUnit: 'METERS',
    hourFormat: 'H24',
    dateFormat: 'dd/mm/yyyy'
  },
}

const LOCALSTORAGE_PREFERENCES_KEY = 'trailence.preferences';
const LOCALSTORAGE_LARGER_TOUCH_TARGETS = 'trailence.larger_touch_targets';
const LOCALSTORAGE_LARGER_TEXTS = 'trailence.larger_texts';
const LOCALSTORAGE_TO_SAVE_KEY = 'trailence.preferences.tosave';

const DEFAULT_TRACE_MIN_METERS = 3;
const DEFAULT_TRACE_MIN_MILLIS = 5000;

const DEFAULT_OFFLINE_MAP_MAX_KEEP_DAYS = 100;
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
  private readonly _saveNeeded$ = new BehaviorSubject<PreferenceToSave[]>([]);
  private destroyed = false;
  private subscription?: Subscription;
  private device = 'web';
  private _largerTouchTargets = false;
  private _largerTexts = false;

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
          lang: toLocaleKey(parsed['lang']),
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
          elevationCalibrationByDevice: parsed['elevationCalibrationByDevice'] ?? undefined,
          trailFilters: this.fixTrailFilters(parsed['trailFilters']) ?? undefined,
        }
      }
    } catch (e) {} // NOSONAR
    try {
      const stored = localStorage.getItem(LOCALSTORAGE_LARGER_TOUCH_TARGETS);
      if (stored === 'true') this.setLargerTouchTargets(true);
    } catch (e) {} // NOSONAR
    try {
      const stored = localStorage.getItem(LOCALSTORAGE_LARGER_TEXTS);
      if (stored === 'true') this.setLargerTexts(true);
    } catch (e) {} // NOSONAR
    this._prefs$ = new BehaviorSubject<Preferences>(prefs);
    this._computed$ = new BehaviorSubject<ComputedPreferences>(this.compute(this._prefs$.value));
    logger.info('Initial preferences: ', this._computed$.value);
    this.initDevice();
    try {
      const stored = localStorage.getItem(LOCALSTORAGE_TO_SAVE_KEY);
      if (stored) {
        let toSave = JSON.parse(stored);
        if (Array.isArray(toSave)) {
          toSave = toSave.filter(p => {
            if (!p['email']) return false;
            return true;
          });
          this._saveNeeded$.next(toSave);
        }
      }
    } catch (e) {} // NOSONAR
    setTimeout(() => this.init(), 1);
  }

  private initDevice(): void {
    Trailence.getInfo({}).then(info => {
      let elements = [];
      if (info?.['deviceBrand']) elements.push(info['deviceBrand']);
      if (info?.['deviceModel']) elements.push(info['deviceModel']);
      if (elements.length === 0 && info?.['deviceName']) elements.push(info['deviceName']);
      if (elements.length === 0) this.device = 'web';
      else this.device = elements.join(' ');
    });
  }

  private fixTrailFilters(loaded: any): {[name: string]: Filters} | undefined {
    if (!loaded || typeof loaded !== 'object') return undefined;
    const fixed: {[name: string]: Filters} = {};
    for (let filterName of Object.keys(loaded)) {
      const fix = FiltersUtils.fix(loaded[filterName]);
      if (fix) fixed[filterName] = fix;
    }
    return fixed;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.subscription?.unsubscribe();
  }

  public setLargerTouchTargets(enabled: boolean): void {
    this._largerTouchTargets = enabled;
    localStorage.setItem(LOCALSTORAGE_LARGER_TOUCH_TARGETS, '' + enabled);
    if (enabled) document.documentElement.classList.add('larger-touch-targets');
    else document.documentElement.classList.remove('larger-touch-targets');
  }

  public get largerTouchTargets() { return this._largerTouchTargets; }

  public setLargerTexts(enabled: boolean): void {
    this._largerTexts = enabled;
    localStorage.setItem(LOCALSTORAGE_LARGER_TEXTS, '' + enabled);
    if (enabled) document.documentElement.classList.add('larger-texts');
    else document.documentElement.classList.remove('larger-texts');
  }

  public get largerTexts() { return this._largerTexts; }

  private init(): void {
    if (this.destroyed) return;
    this._prefs$.pipe(debounceTime(10)).subscribe(p => {
      localStorage.setItem(LOCALSTORAGE_PREFERENCES_KEY, JSON.stringify(p));
      const computed = this.compute(p);
      logger.info('Preferences: ', computed);
      globalThis.document.body.classList.remove('dark-theme', 'light-theme');
      const theme = computed.theme === 'SYSTEM' ? this._systemTheme : computed.theme;
      globalThis.document.body.classList.add(theme.toLowerCase() + '-theme');
      document.documentElement.style.colorScheme = theme;
      this._computed$.next(computed);
    });
    this.injector.get(AuthService).auth$.subscribe(auth => {
      if (auth?.preferences) {
        logger.info("Preferences from login", auth.preferences);
        const prefs = {...auth.preferences};
        this.complete(prefs, this._prefs$.value);
        this._prefs$.next(prefs);
      }
    });
    this.subscription = combineLatest([this.injector.get(NetworkService).server$, this.injector.get(AuthService).auth$, this._saveNeeded$])
    .pipe(
      debounceTime(1000),
    )
    .subscribe(
      ([connected, auth, saveNeeded]) => {
        if (!connected) return;
        if (!auth || auth.isAnonymous) return;
        if (saveNeeded.length === 0) return;
        const forUser: PreferenceToSave[] = [];
        const forOthers: PreferenceToSave[] = [];
        for (const p of saveNeeded) {
          if (p.email === auth.email) forUser.push(p);
          // cancel preferences for other users older than 1 month
          else if (p.setAt < Date.now() - 31 * 24 * 60 * 60 * 1000) forOthers.push(p);
        }
        if (forUser.length === 0) return;
        let prefs = auth.preferences ?? {};
        let changed = false;
        for (const p of forUser) {
          if (p.field === undefined) {
            // reset
            prefs = {};
            changed = true;
          } else {
            const currentValue = (prefs as any)[p.field];
            if (currentValue === p.previousValue || currentValue === p.newValue) {
              (prefs as any)[p.field] = p.newValue;
              changed = true;
            }
          }
        }
        if (changed) {
          const body = {...prefs};
          logger.info('Saving user preferences', body);
          auth.preferences = prefs;
          this.injector.get(AuthService).preferencesUpdated();
          this._prefs$.next(prefs);
          this.injector.get(HttpService).put(environment.apiBaseUrl + '/preferences/v1', body, undefined, {custom: {errorIfRenewAuth: () => new Error('auth renewed => save preferences delayed')}}).subscribe({
            complete: () => {
              logger.info('Preferences saved for user', body);
            },
            error: e => {
              logger.warn('Cannot save preferences', e);
              forOthers.push(...forUser);
              this.storeToSave(forOthers);
              this._saveNeeded$.next(forOthers);
            }
          });
        }
        this.storeToSave(forOthers);
        this._saveNeeded$.next(forOthers);
      }
    );
  }

  private compute(p: Preferences): ComputedPreferences {
    const result = {...p};
    if (!result.lang || !defaultPreferences[result.lang])
      result.lang = this.getDefaultLanguage();
    this.complete(result, defaultPreferences[result.lang!]);
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
    if (toComplete.elevationCalibrationByDevice === null) toComplete.elevationCalibrationByDevice = undefined;
    if (toComplete.trailFilters === null) toComplete.trailFilters = undefined;
  }

  private completeEnum<T>(value: string | undefined, defaultValue: T, allowedValues: string[]): T {
    if (value === undefined) return defaultValue;
    if (allowedValues.includes(value)) return value as T;
    return defaultValue;
  }

  private getDefaultLanguage(): LocaleKey { // NOSONAR
    let s = globalThis.location.search;
    if (s.length > 0) {
      const params = StringUtils.parseQueryParams(s);
      let l = params['lang'];
      if ('string' === typeof l) {
        l = l.toLowerCase();
        if (Object.keys(defaultPreferences).includes(params['lang'])) return l;
      }
    }
    s = globalThis.navigator.language;
    if (s) {
      if (s.length > 2) s = s.substring(0, 2);
      s = s.toLowerCase();
      if (Object.keys(defaultPreferences).includes(s)) {
        return s as LocaleKey;
      }
    }
    for (s in globalThis.navigator.languages) {
      if (s.length > 2) s = s.substring(0, 2);
      s = s.toLowerCase();
      if (Object.keys(defaultPreferences).includes(s)) {
        return s as LocaleKey;
      }
    }
    return DEFAULT_LOCALE_KEY;
  }

  public get preferences$(): Observable<ComputedPreferences> { return this._computed$ };
  public get preferences(): ComputedPreferences { return this._computed$.value; }

  public setLanguage(lang: LocaleKey): void {
    const authService = this.injector.get(AuthService);
    const auth = authService.auth;
    if (auth && auth.preferences?.lang !== lang) {
      auth.preferences ??= {};
      const previous = auth.preferences.lang;
      auth.preferences.lang = lang;
      authService.preferencesUpdated();
      if (!auth.isAnonymous)
        this.save(auth.email, 'lang', previous ?? undefined, lang);
    }
    if (this._prefs$.value.lang !== lang) {
      this._prefs$.value.lang = lang;
      this._prefs$.next(this._prefs$.value);
    }
  }

  public setLanguageIfKnown(lang: string | null | undefined): void {
    const key = toLocaleKey(lang);
    if (!key) return;
    this.setLanguage(key);
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

  public getElevationCalibration(device: string | null | undefined, inUserUnit: boolean): number {
    let value = this.preferences.elevationCalibrationByDevice?.[device ?? this.device] ?? 0;
    if (inUserUnit) value = this.injector.get(I18nService).elevationInUserUnit(value);
    return value;
  }

  public getElevationCalibrationDevices(): string[] {
    let devices = Object.keys(this.preferences.elevationCalibrationByDevice ?? {});
    if (!devices.includes(this.device)) devices.push(this.device);
    return devices;
  }

  public getThisDevice(): string {
    return this.device;
  }

  public setElevationCalibration(value: number | null | undefined, device: string | null | undefined, inUserUnit: boolean): void {
    let meters = value ?? 0;
    if (inUserUnit) meters = Math.round(this.injector.get(I18nService).elevationInMetersFromUserUnit(meters));
    const v = this.preferences.elevationCalibrationByDevice ?? {};
    v[device ?? this.device] = meters;
    this.setPreference('elevationCalibrationByDevice', {...v});
  }

  public saveTrailFilters(trailFilters: {[name: string]: Filters} | undefined): void {
    this.setPreference('trailFilters', trailFilters);
  }

  private setPreference(field: string, value: any): void {
    const current = {...this._prefs$.value} as any;
    const authService = this.injector.get(AuthService);
    const auth = authService.auth;
    if (auth) {
      const currentValue = auth?.preferences ? (auth.preferences as any)[field] : undefined;
      if (currentValue !== value) {
        auth.preferences ??= {};
        (auth.preferences as any)[field] = value;
        authService.preferencesUpdated();
        if (!auth.isAnonymous)
          this.save(auth.email, field, currentValue ?? undefined, value ?? undefined);
      }
    }
    if (current[field] !== value) {
      const newPrefs = {...current};
      newPrefs[field] = value;
      this._prefs$.next(newPrefs);
    }
  }

  public resetAll(): void {
    const authService = this.injector.get(AuthService);
    const auth = authService.auth;
    if (auth) {
      auth.preferences = {};
      authService.preferencesUpdated();
      if (!auth.isAnonymous)
        this.save(auth.email, undefined, undefined, undefined);
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

  private save(email: string, field: string | undefined, previousValue: string | undefined, newValue: string | undefined): void {
    let toSave = this._saveNeeded$.value;
    toSave = toSave.filter(p => {
      if (p.email !== email) return true;
      if (field === undefined) return false;
      if (p.field === field) return false;
      return true;
    });
    toSave.push({email, field, previousValue, newValue, setAt: Date.now()});
    this.storeToSave(toSave);
    this._saveNeeded$.next(toSave);
  }

  private storeToSave(toSave: PreferenceToSave[]): void {
    logger.info('Preferences to save', toSave);
    localStorage.setItem(LOCALSTORAGE_TO_SAVE_KEY, JSON.stringify(toSave));
  }

}

interface PreferenceToSave {
  email: string;
  field: string | undefined;
  previousValue: string | undefined;
  newValue: string | undefined;
  setAt: number;
}
