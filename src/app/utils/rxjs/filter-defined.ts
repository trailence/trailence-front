import { filter } from 'rxjs';

export function filterDefined() {
  return filter(e => !!e)
}
