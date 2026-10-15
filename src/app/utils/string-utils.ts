import { TypeUtils } from './type-utils';

const illegalRe = /[\/\?<>\\:\*\|"]/g; // NOSONAR
const controlRe = /[\x00-\x1f\x80-\x9f]/g; // NOSONAR
const reservedRe = /^\.+$/;
const windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i; // NOSONAR
const windowsTrailingRe = /[\. ]+$/; // NOSONAR
const wordRe = /[a-z]/i;

export const EMAIL_REGEX = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z\-0-9]{2,}))$/; // NOSONAR

export const NULL_UUID = '00000000-0000-0000-0000-000000000000';

export class StringUtils {

  public static padLeft(s: string, minLength: number, pad: string): string {
    while (s.length < minLength) {
      s = pad + s;
    }
    return s;
  }

  public static padRight(s: string, minLength: number, pad: string): string {
    while (s.length < minLength) {
      s += pad;
    }
    return s;
  }

  public static isWordChar(c: string): boolean {
    return !!wordRe.exec(c);
  }

  public static toFilename(input: string): string {
    let sanitized = input
      .replace(illegalRe, '_') // NOSONAR
      .replace(controlRe, '_') // NOSONAR
      .replace(reservedRe, '_')
      .replace(windowsReservedRe, '_')
      .replace(windowsTrailingRe, '_')
      .replace(/_{2,}/g, '_'); // NOSONAR
    if (sanitized.length > 200) sanitized = sanitized.substring(0, 200);
    return sanitized;
  }

  public static timestampToIso8601(timestamp: number, tzOffset?: number): string {
    const localDate = new Date(timestamp);
    if (tzOffset === undefined || tzOffset === 0) return localDate.toISOString();
    const realDate = TypeUtils.toOriginalDate(new Date(timestamp), tzOffset);
    return StringUtils.dateToIso8601(realDate, tzOffset);
  }

  public static dateToIso8601(date: Date, tzOffset: number): string {
    if (tzOffset === 0) return date.toISOString();
    return this.dateToIso8601NoTimezone(date) +
      (tzOffset > 0 ? '+' : '-') +
      StringUtils.padLeft('' + Math.abs(Math.floor(tzOffset / 60)), 2, '0') +
      ':' + StringUtils.padLeft('' + Math.abs(tzOffset % 60), 2, '0');
  }

  public static dateToIso8601NoTimezone(date: Date): string {
    return StringUtils.padLeft('' + date.getFullYear(), 4, '0') + '-' +
      StringUtils.padLeft('' + (date.getMonth() + 1), 2, '0') + '-' +
      StringUtils.padLeft('' + date.getDate(), 2, '0') + 'T' +
      StringUtils.padLeft('' + date.getHours(), 2, '0') + ':' +
      StringUtils.padLeft('' + date.getMinutes(), 2, '0') + ':' +
      StringUtils.padLeft('' + date.getSeconds(), 2, '0') + '.' +
      StringUtils.padLeft('' + date.getMilliseconds(), 3, '0');
  }

  public static versionCodeToVersionName(v?: number): string {
    if (!v) return '';
    const fixVersion = v % 100;
    const minorVersion = Math.floor(v / 100) % 100;
    const majorVersion = Math.floor(v / 10000);
    return majorVersion + '.' + minorVersion + '.' + fixVersion;
  };

  public static versionNameToVersionCode(name: string): number | undefined {
    let i = name.indexOf('.');
    if (i <= 0) return undefined;
    const majorVersion = Number.parseInt(name.substring(0, i));
    if (Number.isNaN(majorVersion) || majorVersion < 0 || majorVersion > 99) return undefined;
    name = name.substring(i + 1);

    i = name.indexOf('.');
    if (i <= 0) return undefined;
    const minorVersion = Number.parseInt(name.substring(0, i));
    if (Number.isNaN(minorVersion) || minorVersion < 0 || minorVersion > 99) return undefined;
    name = name.substring(i + 1);

    const fixVersion = Number.parseInt(name);
    if (Number.isNaN(fixVersion) || fixVersion < 0 || fixVersion > 99) return undefined;

    return majorVersion * 10000 + minorVersion * 100 + fixVersion;
  }

}
