import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from './i18n.service';
import { combineLatest, map, Observable, of } from 'rxjs';

export interface I18nString {

  translate(i18n: I18nService): string;

  translate$(i18n: I18nService): Observable<string>;

}

export class TranslatedString implements I18nString {

  constructor(private readonly i18nKey: string, private readonly args: any[] = []) {}

  translate(i18n: I18nService): string {
    return i18n.translateWithArguments(this.i18nKey, this.args);
  }

  translate$(i18n: I18nService): Observable<string> {
    return i18n.translateWithArguments$(this.i18nKey, this.args);
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
      result += i18n.translateValue(part);
    }
    return result;
  }

  translate$(i18n: I18nService): Observable<string> {
    if (this.parts.length === 0) return of('');
    return combineLatest(this.parts.map(part => i18n.translateValue$(part))).pipe(map(strings => strings.join('')));
  }

}

export class DateTimeI18nString implements I18nString {

  constructor(private readonly date: number) {}

  translate(i18n: I18nService): string {
    return i18n.timestampToDateTimeString(this.date);
  }

  translate$(i18n: I18nService): Observable<string> {
    return i18n.texts$.pipe(map(() => this.translate(i18n)));
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
