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

}
