export class Arrays {

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

  public static includesAll<T>(array: T[], toBeContained: T[]): boolean {
    for (const element of toBeContained) if (!array.includes(element)) return false;
    return true;
  }

  public static chunk<T>(array: T[], chunkSize: number): T[][] {
    if (array.length <= chunkSize) return [array];
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      if (i + chunkSize >= array.length) result.push(array.slice(i));
      else result.push(array.slice(i, i + chunkSize));
    }
    return result;
  }

}

export class CollectionMapper<S, T> {

  private readonly _current: {source: S, target: T}[] = [];

  constructor(
    private readonly mapper: (item: S) => T,
    private readonly matcher: (item1: S, item2: S) => boolean = (item1, item2) => { return item1 === item2; }
  ) {}

  public update(items: S[]): T[] {
    const result: T[] = [];
    if (this._current.length > 0) {
      for (let i = 0; i < this._current.length; ++i) {
        const known = this._current[i];
        if (!items.some(item => this.matcher(item, known.source))) {
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
