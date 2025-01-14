import { Params } from '@angular/router';

const illegalRe = /[\/\?<>\\:\*\|"]/g; // NOSONAR
const controlRe = /[\x00-\x1f\x80-\x9f]/g; // NOSONAR
const reservedRe = /^\.+$/;
const windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i; // NOSONAR
const windowsTrailingRe = /[\. ]+$/; // NOSONAR


export class StringUtils {

  public static padLeft(s: string, minLength: number, pad: string): string {
    while (s.length < minLength) {
      s = pad + s;
    }
    return s;
  }

  public static toFilename(input: string): string {
    let sanitized = input
      .replace(illegalRe, '_')
      .replace(controlRe, '_')
      .replace(reservedRe, '_')
      .replace(windowsReservedRe, '_')
      .replace(windowsTrailingRe, '_')
      .replace(/_{2,}/g, '_');
    if (sanitized.length > 200) sanitized = sanitized.substring(0, 200);
    return sanitized;
  }

  public static parseQueryParams(url: string): Params {
    const q = url.indexOf('?');
    if (q < 0) return {};
    const query = url.substring(q + 1);
    const queryParams: Params = {};
    const search = /([^&=]+)=?([^&]*)/g;
    const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, ' '));
    let match;
    while (match = search.exec(query))
      queryParams[decode(match[1])] = decode(match[2]);
    return queryParams;
  }

  public static versionCodeToVersionName(v?: number): string {
    if (!v) return '';
    const fixVersion = v % 100;
    const minorVersion = Math.floor(v / 100) % 100;
    const majorVersion = Math.floor(v / 10000);
    return majorVersion + '.' + minorVersion + '.' + fixVersion;
  };

}
