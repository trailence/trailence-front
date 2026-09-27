import { StringUtils } from './string-utils';

export interface Logger {
  debug(...args: any): void;
  info(...args: any): void;
  warn(...args: any): void;
  error(...args: any): void;
}

export function getLogger(name: string): Logger {
  return new LoggerImpl(name);
}

export function getLogHistory(): LogLine[] {
  return Console.getHistoryLines();
}

export function logLineToDisplay(log: LogLine): string {
  return Console.header(log.context) + ' ' + log.log;
}


class LoggerImpl implements Logger {

  constructor(
    private readonly name: string,
  ) {}

  debug(...args: any): void {
    this.log(ConsoleLevel.DEBUG, ...args);
  }
  info(...args: any): void {
    this.log(ConsoleLevel.INFO, ...args);
  }
  warn(...args: any): void {
    this.log(ConsoleLevel.WARN, ...args);
  }
  error(...args: any): void {
    this.log(ConsoleLevel.ERROR, ...args);
  }

  private log(level: ConsoleLevel, ...args: any): void {
    Console.log({level, logger: this.name, date: Date.now()}, ...args);
  }

}

export enum ConsoleLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO ',
  WARN = 'WARN ',
  ERROR = 'ERROR',
}

export interface LogContext {
  date: number;
  level: ConsoleLevel;
  logger: string;
}

export interface LogLine {
  context: LogContext;
  log:string;
}

class Console {

  private static readonly _history: LogLine[] = [];

  public static getHistoryLines() {
    return [...this._history];
  }

  static log(context: LogContext, ...args: any[]): void {

    switch (context.level) {
      case ConsoleLevel.DEBUG: console.debug(Console.header(context), ...args); break;
      case ConsoleLevel.WARN: console.warn(Console.header(context), ...args); break;
      case ConsoleLevel.ERROR: console.error(Console.header(context), ...args); break;
      case ConsoleLevel.INFO:
      default:
        console.info(Console.header(context), ...args); break;
    }
    if (navigator.webdriver) {
      const w = globalThis as any;
      w._consoleHistory ??= [];
      w._consoleHistory.push(Console.header(context) + this.generateForHistory(args));
    } else {
      this._history.push({log: this.generateForHistory(args), context});
      if ((this._history.length >= 1000) && (this._history.length % 100) === 0)
        this.cleanHistory();
    }
  }

  static header(context: LogContext): string {
    const d = new Date(context.date);
    return '[' +
      d.getFullYear() + '-' +
      StringUtils.padLeft('' + (d.getMonth() + 1), 2, '0') + '-' +
      StringUtils.padLeft('' + d.getDate(), 2, '0') + ' ' +
      StringUtils.padLeft('' + d.getHours(), 2, '0') + ':' +
      StringUtils.padLeft('' + d.getMinutes(), 2, '0') + ':' +
      StringUtils.padLeft('' + d.getSeconds(), 2, '0') + '.' +
      StringUtils.padLeft('' + d.getMilliseconds(), 3, '0') +
    ']' + ' ' + context.level + ' [' + StringUtils.padRight(context.logger, 20, ' ') + '] ';
  }

  private static cleanHistory(): void {
    if (this._history.length > 15000) this._history.splice(0, this._history.length - 15000);
    const errorsTimes: number[] = [];
    for (const h of this._history) if (h.context.level === ConsoleLevel.ERROR) errorsTimes.push(h.context.date);
    const now = Date.now();
    const maxTime = now - 15 * 60 * 1000;
    for (let i = 0; i < this._history.length - 250; ++i) {
      const h = this._history[i];
      if (h.context.date < maxTime && !errorsTimes.some(t => t > h.context.date - 60000 && t < h.context.date + 60000)) {
        this._history.splice(i, 1);
        i--;
      }
    }
  }

  private static generateForHistory(args: any[]): string {
    const convert = (a: any, done: any[], deep: number) => { // NOSONAR
      try {
        if (Array.isArray(a)) {
          if (done.includes(a)) return '<duplicate>';
          if (deep > 3) return '[...<too deep>]';
          let s = '[';
          for (const element of a) {
            s += convert(element, [...done, a], deep + 1) + ',';
            if (s.length > 1000) return s + ', ...<too large>]';
          }
          return s + ']';
        }
        if (a && typeof a === 'object') {
          if (a instanceof Date) {
            return a.toString();
          }
          if (done.includes(a)) return '<duplicate>';
          if (deep > 3) return '{...<too deep>}';
          let s = '{';
          for (const key of Object.getOwnPropertyNames(a)) {
            let v = typeof a[key] === 'function' ? 'function' : a[key];
            s += key + ': ' + convert(v, [...done, a], deep + 1) + ',';
            if (s.length > 1000) return s + ', ...<too large>}';
          }
          return s + '}';
        }
        return '' + a;
      } catch (e) {
        return '<cannot convert: ' + e + '>';
      }
    };
    return args.map(a => convert(a, [], 0)).join(' - ')
  }

}
