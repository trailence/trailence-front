export class Arrays {

  public static last<T>(array: T[]): T | undefined {
    if (array.length === 0) return undefined;
    return array[array.length - 1];
  }

  public static sameContent<T>(array1: T[], array2: T[], comparator: (element1: T, element2: T) => boolean = (e1, e2) => e1 === e2): boolean {
    if (array1.length !== array2.length) return false;
    const remaining2 = [...array2];
    for (const element1 of array1) {
      const index = Arrays.indexOf(remaining2, element1, comparator);
      if (index < 0) return false;
      remaining2.splice(index, 1);
    }
    return true;
  }

  public static indexOf<T>(array: T[], element: T, comparator: (element1: T, element2: T) => boolean = (e1, e2) => e1 === e2): number {
    for (let index = 0; index < array.length; ++index) {
      if (comparator(element, array[index])) return index;
    }
    return -1;
  }

  public static findLastIndex<T>(array: T[], predicate: (element: T) => boolean): number {
    for (let i = array.length - 1; i >= 0; --i)
      if (predicate(array[i])) return i;
    return -1;
  }

  // available in ES2019 as Array.flatMap
  public static flatMap<T, U>(array: T[], callback: (value: T) => U[]): U[] {
    const result: U[] = [];
    array.forEach(value => result.push(...callback(value)));
    return result;
  }

}

export class CollectionMapper<S, T> {

  private _current: {source: S, target: T}[] = [];

  constructor(
    private mapper: (item: S) => T,
    private matcher: (item1: S, item2: S) => boolean = (item1, item2) => { return item1 === item2; }
  ) {}

  public update(items: S[]): T[] {
    const result: T[] = [];
    if (this._current.length > 0) {
      const toRemove: S[] = [];
      for (let i = 0; i < this._current.length; ++i) {
        const known = this._current[i];
        if (items.findIndex(item => this.matcher(item, known.source)) < 0) {
          this._current.splice(i, 1);
          i--;
        }
      }
    }
    for (const source of items) {
      let known = this._current.find(k => this.matcher(k.source, source));
      if (!known) {
        known = {source, target: this.mapper(source)};
        this._current.push(known);
      }
      result.push(known.target);
    }
    return result;
  }

}
