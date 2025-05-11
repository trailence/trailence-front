import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from './i18n.service';
import { combineLatest, map, Observable, of, switchMap } from 'rxjs';

export interface I18nString {

  translate(i18n: I18nService): string;

  translate$(i18n: I18nService): Observable<string>;

}

export function translate(value: any, i18n: I18nService): string {
  if (typeof value === 'object' && typeof value['translate'] === 'function')
    return value.translate(i18n);
  return '' + value;
}

export function translate$(value: any, i18n: I18nService): Observable<string> {
  if (typeof value === 'object') {
    if (typeof value['translate$'] === 'function') return value.translate$(i18n);
    if (typeof value['translate'] === 'function') return of(value.translate(i18n));
    if (value instanceof Observable) {
      return value.pipe(switchMap(v => translate$(v, i18n)));
    }
  }
  return of('' + value);
}

export class TranslatedString implements I18nString {

  constructor(private readonly i18nKey: string, private readonly args: any[] = []) {}

  translate(i18n: I18nService): string {
    const path = this.i18nKey.split('.');
    let t = i18n.texts;
    for (const name of path) t = t ? t[name] : undefined;
    if (typeof t !== 'string') {
      console.error('Invalid i18n key', this.i18nKey, path, t, i18n.texts);
      return 'Invalid i18nkey: ' + this.i18nKey;
    }
    for (let i = 0; i < this.args.length; ++i) {
      const arg = translate(this.args[i], i18n);
      t = t.replace(new RegExp('\\{\\{' + (i + 1) + '\\}\\}', 'g'), arg);
    }
    return t;
  }

  translate$(i18n: I18nService): Observable<string> {
    const path = this.i18nKey.split('.');
    return i18n.texts$.pipe(
      switchMap(texts => {
        let t = texts;
        for (const name of path) t = t ? t[name] : undefined;
        if (typeof t !== 'string') {
          console.error('Invalid i18n key', this.i18nKey, path, t, i18n.texts);
          return of('Invalid i18nkey: ' + this.i18nKey);
        }
        if (this.args.length === 0) return of(t);
        return combineLatest(this.args.map(arg => translate$(arg, i18n))).pipe(
          map(args => {
            let finalString = t;
            for (let i = 0; i < args.length; ++i) {
              const arg = args[i];
              finalString = finalString.replace(new RegExp('\\{\\{' + (i + 1) + '\\}\\}', 'g'), arg);
            }
            return finalString;
          })
        );
      })
    );
  }

}

export class I18nError extends Error implements I18nString {

  private readonly _i18n: TranslatedString;

  constructor(i18nKey: string, args: any[] = []) {
    super(i18nKey);
    this._i18n = new TranslatedString(i18nKey, args);
  }

  translate(i18n: I18nService): string {
    return this._i18n.translate(i18n);
  }

  translate$(i18n: I18nService): Observable<string> {
    return this._i18n.translate$(i18n);
  }

}

export class CompositeI18nString implements I18nString {

  constructor(private readonly parts: any[]) {}

  translate(i18n: I18nService): string {
    let result = '';
    for (const part of this.parts) {
      result += translate(part, i18n);
    }
    return result;
  }

  translate$(i18n: I18nService): Observable<string> {
    if (this.parts.length === 0) return of('');
    return combineLatest(this.parts.map(part => translate$(part, i18n))).pipe(map(strings => strings.join()));
  }

}

@Pipe({
  name: 'i18nString'
})
export class I18nPipe implements PipeTransform {

  constructor(private readonly service: I18nService) {}

  transform(value: any, ...args: any[]): string {
    return new TranslatedString(value, args).translate(this.service);
  }

}
