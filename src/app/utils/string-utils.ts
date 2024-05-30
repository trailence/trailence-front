export class StringUtils {

    public static padLeft(s: string, minLength: number, pad: string): string {
        while (s.length < minLength) {
          s = pad + s;
        }
        return s;
    }

}