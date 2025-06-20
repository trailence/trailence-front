import { StringUtils } from './string-utils';

export enum ConsoleLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO ',
  WARN = 'WARN ',
  ERROR = 'ERROR',
}

export class Console {

  private static readonly _history: {log: string, date: number, level: ConsoleLevel}[] = [];

  public static getHistory(): string {
    let s = '';
    for (let i = this._history.length - 1; i >= 0; --i) {
      s = this._history[i].log + '\n' + s;
      if (s.length > 1000000) break;
    }
    return s;
  }

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
      w._consoleHistory ??= [];
      w._consoleHistory.push(this.generateForHistory(level, args));
    } else {
      this._history.push({log: this.generateForHistory(level, args), date: Date.now(), level});
      if ((this._history.length >= 1000) && (this._history.length % 100) === 0)
        this.cleanHistory();
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

  private static cleanHistory(): void {
    if (this._history.length > 15000) this._history.splice(0, this._history.length - 15000);
    const errorsTimes: number[] = [];
    for (const h of this._history) if (h.level === ConsoleLevel.ERROR) errorsTimes.push(h.date);
    const now = Date.now();
    const maxTime = now - 15 * 60 * 1000;
    for (let i = 0; i < this._history.length - 250; ++i) {
      const h = this._history[i];
      if (h.date < maxTime && !errorsTimes.find(t => t > h.date - 60000 && t < h.date + 60000)) {
        this._history.splice(i, 1);
        i--;
      }
    }
  }

  private static generateForHistory(level: ConsoleLevel, args: any[]): string {
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
          if (a instanceof Date) {
            return a.toString();
          }
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
    return Console.header(level) + args.map(a => convert(a, [], 0)).join(' - ')
  }

}
