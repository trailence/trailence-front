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

  constructor(private i18nKey: string, private args: any[] = []) {}

  translate(i18n: I18nService): string {
    const path = this.i18nKey.split('.');
    let t = i18n.texts;
    for (const name of path) t = t ? t[name] : undefined;
    if (typeof t !== 'string') return 'Invalid i18nkey: ' + this.i18nKey;
    for (let i = 0; i < this.args.length; ++i) {
      const arg = translate(this.args[i], i18n);
      t = t.replace(new RegExp('\\{\\{' + (i + 1) + '\\}\\}', 'g'), arg);
    }
    return t;
  }

}

export class I18nError extends Error implements I18nString {

  private _i18n: TranslatedString;

  constructor(i18nKey: string, args: any[] = []) {
    super(i18nKey);
    this._i18n = new TranslatedString(i18nKey, args);
  }

  translate(i18n: I18nService): string {
    return this._i18n.translate(i18n);
  }

}