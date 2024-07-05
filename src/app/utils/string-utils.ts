const illegalRe = /[\/\?<>\\:\*\|"]/g;
const controlRe = /[\x00-\x1f\x80-\x9f]/g;
const reservedRe = /^\.+$/;
const windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const windowsTrailingRe = /[\. ]+$/;


export class StringUtils {

    public static padLeft(s: string, minLength: number, pad: string): string {
        while (s.length < minLength) {
          s = pad + s;
        }
        return s;
    }

    public static toFilename(input: string): string {
      var sanitized = input
        .replace(illegalRe, '_')
        .replace(controlRe, '_')
        .replace(reservedRe, '_')
        .replace(windowsReservedRe, '_')
        .replace(windowsTrailingRe, '_')
        .replace(/_{2,}/g, '_');
      if (sanitized.length > 200) sanitized = sanitized.substring(0, 200);
      return sanitized;
    }

}
