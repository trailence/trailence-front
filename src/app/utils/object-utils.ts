import { Arrays } from './arrays';

export class ObjectUtils {

  public static compare(a: any, b: any): number { // NOSONAR
    if (a === undefined || a === null) return b === undefined || b === null ? 0 : -1;
    if (b === undefined || b === null) return 1;
    if (typeof a === 'number') {
      if (typeof b !== 'number') return -1;
      return a < b ? - 1 : a > b ? 1 : 0;
    }
    if (typeof a === 'string') {
      if (typeof b !== 'string') return -1;
      return a.localeCompare(b);
    }
    return 0;
  }

  public static extractField(object: any, path: string): any {
    const keys = path.split('.');
    let v = object;
    for (const key of keys) {
      v = v[key];
      if (!v) return v;
    }
    return v;
  }

  public static sameContent(o1: any, o2: any, levels: number): boolean { // NOSONAR
    if (o1 === o2) return true;
    if (o1 === undefined) return o2 === undefined;
    if (o1 === null) return o2 === null;
    if (o2 === undefined || o2 === null) return false;
    if (typeof o1 === 'string') return (typeof o2 === 'string') && o1 === o2;
    if (typeof o2 === 'string') return false;
    if (typeof o1 === 'number') return (typeof o2 === 'number') && o1 === o2;
    if (typeof o2 === 'number') return false;
    if (levels === 0) return false;
    if (Array.isArray(o1)) return Array.isArray(o2) && Arrays.sameContent(o1, o2, (e1, e2) => this.sameContent(e1, e2, levels - 1));
    if (Array.isArray(o2)) return false;
    if (typeof o1 === 'object' && typeof o2 === 'object') {
      const keys1 = Object.getOwnPropertyNames(o1);
      const keys2 = Object.getOwnPropertyNames(o2);
      if (!Arrays.sameContent(keys1, keys2)) return false;
      for (const key of keys1) {
        if (!this.sameContent(o1[key], o2[key], levels - 1)) return false;
      }
      return true;
    }
    return false;
  }

}
