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

}
