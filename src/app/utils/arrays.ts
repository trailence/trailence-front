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

}
