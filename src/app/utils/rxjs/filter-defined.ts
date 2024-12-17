import { filter, OperatorFunction } from 'rxjs';

export function filterDefined<T>() {
  return filter((e: T | null | undefined) => !!e) as OperatorFunction<T | null | undefined, T>
}

export function filterItemsDefined<T>(array: (T | null | undefined)[]): T[] {
  return array.filter(e => !!e) as T[];
}
