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

  public static toInteger(s: string | null | undefined): number | undefined {
    if (!s) {
        return undefined;
    }
    const n = parseInt(s);
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

  public static valueToEnum<T>(value: any, enumType: any): T | undefined {
    if (value === null || value === undefined) return undefined;
    const key = Object.keys(enumType).find(k => enumType[k] === value) as T | undefined;
    return key ? enumType[key] : undefined;
  }

  public static convertDMSToDD(direction: string, degrees: number, minutes: number, seconds: number): number {
    const dd = degrees + minutes/60 + seconds/(60*60);

    if (direction == "S" || direction == "W") {
        return -dd;
    }
    return dd; // N or E
  }

}
