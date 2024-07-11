export class TypeUtils {

  public static toFloat(s: string | null | undefined): number | undefined {
    if (!s) {
        return undefined;
    }
    const n = parseFloat(s);
    if (isNaN(n)) {
        return undefined;
    }
    return n;
  }

  public static toDate(s: string | null | undefined): Date | undefined {
    if (!s) {
        return undefined;
    }
    const d = new Date(s);
    return d;
  }

  public static addOrUndefined(n1: number | undefined, n2: number | undefined): number | undefined {
    if (n1 === undefined) return undefined;
    if (n2 === undefined) return undefined;
    return n1 + n2;
  }

}
