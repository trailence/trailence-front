export class ObjectUtils {

    public static compare(a: any, b: any): number {
        if (typeof a === 'number') return a < b ? - 1 : a > b ? 1 : 0;
        if (typeof a === 'string') return a.localeCompare(b);
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