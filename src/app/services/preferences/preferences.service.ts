import { Injectable } from '@angular/core';
import { Preferences } from './preferences';
import { BehaviorSubject, Observable, map } from 'rxjs';
import { AuthService } from '../auth/auth.service';

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

@Injectable({
  providedIn: 'root'
})
export class PreferencesService {

  private _prefs$: BehaviorSubject<Preferences>;
  private _computed$: BehaviorSubject<Preferences>;

  constructor(
    authService: AuthService,
  ) {
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
    this._computed$ = new BehaviorSubject<Preferences>(this.compute(this._prefs$.value));
    this._prefs$.subscribe(p => {
      localStorage.setItem(LOCALSTORAGE_PREFERENCES_KEY, JSON.stringify(p));
      const computed = this.compute(p);
      console.log('Preferences: ', computed);
      this._computed$.next(computed);
    });
  }

  private compute(p: Preferences): Preferences {
    const result = {...p};
    if (!result.lang || !defaultPreferences[result.lang])
      result.lang = this.getDefaultLanguage();
    this.complete(result, defaultPreferences[result.lang]);
    return result;
  }

  private complete(toComplete: Preferences, withPrefs: Preferences): void {
    if (!toComplete.lang) toComplete.lang = withPrefs.lang;
    if (!toComplete.elevationUnit) toComplete.elevationUnit = withPrefs.elevationUnit;
    if (!toComplete.distanceUnit) toComplete.distanceUnit = withPrefs.distanceUnit;
    if (!toComplete.hourFormat) toComplete.hourFormat = withPrefs.hourFormat;
    if (!toComplete.dateFormat) toComplete.dateFormat = withPrefs.dateFormat;
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

  public get preferences$(): Observable<Preferences> { return this._computed$ };
  public get preferences(): Preferences { return this._computed$.value; }

}
