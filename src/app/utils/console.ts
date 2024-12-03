import { StringUtils } from './string-utils';

export enum ConsoleLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO ',
  WARN = 'WARN ',
  ERROR = 'ERROR',
}

export class Console {

  public static debug(...args: any): void {
    Console.log(ConsoleLevel.DEBUG, ...args);
  }

  public static info(...args: any): void {
    Console.log(ConsoleLevel.INFO, ...args);
  }

  public static warn(...args: any): void {
    Console.log(ConsoleLevel.WARN, ...args);
  }

  public static error(...args: any): void {
    Console.log(ConsoleLevel.ERROR, ...args);
  }

  public static log(level: ConsoleLevel, ...args: any[]): void {

    switch (level) {
      case ConsoleLevel.DEBUG: console.debug(Console.header(level), ...args); break;
      case ConsoleLevel.WARN: console.warn(Console.header(level), ...args); break;
      case ConsoleLevel.ERROR: console.error(Console.header(level), ...args); break;
      case ConsoleLevel.INFO:
      default:
        console.info(Console.header(level), ...args); break;
    }
    if (navigator.webdriver) {
      const w = window as any;
      if (!w._consoleHistory) w._consoleHistory = [];
      const convert = (a: any, done: any[], deep: number) => { // NOSONAR
        try {
          if (deep > 3) return '<too deep>';
          if (Array.isArray(a)) {
            if (done.indexOf(a) >= 0) return '<duplicate>';
            let s = '[';
            for (const element of a) {
              s += convert(element, [...done, a], deep + 1) + ',';
            }
            return s + ']';
          }
          if (a && typeof a === 'object') {
            if (done.indexOf(a) >= 0) return '<duplicate>';
            let s = '{';
            for (const key of Object.getOwnPropertyNames(a)) {
              let v = typeof a[key] === 'function' ? 'function' : a[key];
              s += key + ': ' + convert(v, [...done, a], deep + 1) + ',';
            }
            return s + '}';
          }
          return '' + a;
        } catch (e) {
          return '<cannot convert: ' + e + '>';
        }
      };
      w._consoleHistory.push(Console.header(level) + args.map(a => convert(a, [], 0)).join(' - '));
    }
  }

  private static header(level: ConsoleLevel): string {
    const d = new Date();
    return '[' +
      d.getFullYear() + '-' +
      StringUtils.padLeft('' + (d.getMonth() + 1), 2, '0') + '-' +
      StringUtils.padLeft('' + d.getDate(), 2, '0') + ' ' +
      StringUtils.padLeft('' + d.getHours(), 2, '0') + ':' +
      StringUtils.padLeft('' + d.getMinutes(), 2, '0') + ':' +
      StringUtils.padLeft('' + d.getSeconds(), 2, '0') + '.' +
      StringUtils.padLeft('' + d.getMilliseconds(), 3, '0') +
    ']' + ' ' + level + ' ';
  }

}
