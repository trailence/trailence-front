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
