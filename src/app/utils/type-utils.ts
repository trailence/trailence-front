import { StringUtils } from './string-utils';

export class TypeUtils {

  public static toFloat(s: string | null | undefined): number | undefined {
    if (!s) {
        return undefined;
    }
    const n = parseFloat(s);
    if (isNaN(n)) {
        return undefined;
    }
    return n;
  }

  public static toInteger(s: string | null | undefined): number | undefined {
    if (!s) {
        return undefined;
    }
    const n = parseInt(s);
    if (isNaN(n)) {
        return undefined;
    }
    return n;
  }

  public static toDate(s: string | null | undefined): Date | undefined {
    if (!s) {
        return undefined;
    }
    const d = new Date(s);
    return d;
  }

  public static toIso8601NoTimezone(date: Date): string {
    return StringUtils.padLeft('' + date.getFullYear(), 4, '0') + '-' +
      StringUtils.padLeft('' + (date.getMonth() + 1), 2, '0') + '-' +
      StringUtils.padLeft('' + date.getDate(), 2, '0') + 'T' +
      StringUtils.padLeft('' + date.getHours(), 2, '0') + ':' +
      StringUtils.padLeft('' + date.getMinutes(), 2, '0') + ':' +
      StringUtils.padLeft('' + date.getSeconds(), 2, '0') + '.' +
      StringUtils.padLeft('' + date.getMilliseconds(), 3, '0');
  }

  public static addOrUndefined(n1: number | undefined, n2: number | undefined): number | undefined {
    if (n1 === undefined) return undefined;
    if (n2 === undefined) return undefined;
    return n1 + n2;
  }

  public static valueToEnum<T>(value: any, enumType: any): T | undefined {
    if (value === null || value === undefined) return undefined;
    const key = Object.keys(enumType).find(k => enumType[k] === value) as T | undefined;
    return key ? enumType[key] : undefined;
  }

}
