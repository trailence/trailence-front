import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from './i18n.service';

export interface I18nString {

  translate(i18n: I18nService): string;

}

export function translate(value: any, i18n: I18nService): string {
  if (typeof value === 'object' && typeof value['translate'] === 'function')
    return value.translate(i18n);
  return '' + value;
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
