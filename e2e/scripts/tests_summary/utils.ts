export interface Line {
  start: number;
  end: number;
  content: string;
}

export function getLineStartingWith(content: string, start: string): string {
  const i = content.indexOf('\n' + start);
  if (i < 0) return '';
  const j = content.indexOf('\n', i + 1);
  return content.substring(i + 1, j).trim();
}

export function getNextLine(file: string, start: number): Line {
  const end = file.indexOf('\n', start);
  const content = file.substring(start, end).trim();
  return { start, end, content };
}

export function getTextAfter(line: string, start: string): string {
  const i = line.indexOf(start);
  if (i < 0) return '';
  return line.substring(i + start.length);
}

export function getCommandLineArgument(line: string, option: string): string {
  const i = line.indexOf(option + '=');
  if (i < 0) return '';
  const j = i + option.length + 1;
  const k = line.indexOf(' ', j);
  return line.substring(j, k);
}

export function compareBy<T>(v1: T, v2: T, values: ((value: T) => string)[]): number {
  for (const v of values) {
    const c = v(v1).localeCompare(v(v2));
    if (c !== 0) return c;
  }
  return 0;
}

export function distinct<T>(array: T[]): T[] {
  return Array.from(new Set<T>(array).keys());
}

export function padLeft(s: string, pad: string, size: number): string {
  while (s.length < size) s = pad + s;
  return s;
}

export function toTime(time: number | undefined): string {
  if (time === undefined) return '';
  const ms = time % 1000;
  time = Math.floor(time / 1000);
  const seconds = time % 60;
  const minutes = Math.floor(time / 60);
  return padLeft('' + minutes, '0', 2) + ':' + padLeft('' + seconds, '0', 2) + '.' + padLeft('' + ms, '0', 4);
}

export function toSuccess(success: boolean): string {
  return success ? '✅' : '❌';
}

export function toColoredTime(time: number, times: number[]): string {
  if (time === Math.min(...times)) return '<span color="#00FF00">' + toTime(time) + '</span>';
  if (time === Math.max(...times)) return '<span color="#FF0000">' + toTime(time) + '</span>';
  return toTime(time);
}
