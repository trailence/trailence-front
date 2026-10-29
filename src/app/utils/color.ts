import { StringUtils } from './string-utils';

export class Color {

  private _r: number;
  private _g: number;
  private _b: number;
  private _a: number;

  constructor(
    r: number,
    g: number,
    b: number,
    a: number = 1,
  ) {
    this._r = Color.rgbValue(r);
    this._g = Color.rgbValue(g);
    this._b = Color.rgbValue(b);
    this._a = Color.alphaValue(a);
  }

  public static rgbValue(value: number): number {
    return Math.floor(Math.max(0, Math.min(255, value)))
  }

  public static alphaValue(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  public static areSame(c1: Color, c2: Color): boolean {
    return c1._r === c2._r && c1._g === c2._g && c1._b === c2._b && c1._a === c2._a;
  }

  public static parse(s: string): Color {
    if (s.startsWith('#')) {
      if (s.length < 7) throw new Error('Invalid color: ' + s);
      const r = Number.parseInt(s.substring(1, 3), 16);
      const g = Number.parseInt(s.substring(3, 5), 16);
      const b = Number.parseInt(s.substring(5, 7), 16);
      const a = s.length >= 9 ? Number.parseInt(s.substring(7, 9), 16) / 255 : 1;
      return new Color(r, g, b, a);
    }
    if (s.startsWith('rgb(')) {
      const i = s.indexOf(')');
      const elements = s.substring(4, i).split(',');
      return new Color(
        Number.parseInt(elements[0], 10),
        Number.parseInt(elements[1], 10),
        Number.parseInt(elements[2], 10),
        1
      );
    }
    if (s.startsWith('rgba(')) {
      const i = s.indexOf(')');
      const elements = s.substring(5, i).split(',');
      return new Color(
        Number.parseInt(elements[0], 10),
        Number.parseInt(elements[1], 10),
        Number.parseInt(elements[2], 10),
        Number.parseFloat(elements[3])
      );
    }
    switch (s) {
      case 'red': return new Color(255, 0, 0, 1);
      case 'blue': return new Color(0, 0, 255, 1);
      default: throw new Error('Invalid color: ' + s);
    }
  }

  public toString(): string {
    if (this._a === 1) {
      return 'rgb(' + this._r + ',' + this._g + ',' + this._b + ')';
    }
    return 'rgba(' + this._r + ',' + this._g + ',' + this._b + ',' + this._a + ')';
  }

  public toHexString(includeAlpha = true): string {
    return '#' +
      StringUtils.padLeft(this._r.toString(16), 2, '0') +
      StringUtils.padLeft(this._g.toString(16), 2, '0') +
      StringUtils.padLeft(this._b.toString(16), 2, '0') +
      (includeAlpha ? StringUtils.padLeft(Math.floor(this._a * 255).toString(16), 2, '0') : '');
  }

  public copy(): Color {
    return new Color(this._r, this._g, this._b, this._a);
  }

  public get r(): number { return this._r; }
  public set r(value: number) { this._r = Color.rgbValue(value); }
  public get g(): number { return this._g; }
  public set g(value: number) { this._g = Color.rgbValue(value); }
  public get b(): number { return this._b; }
  public set b(value: number) { this._b = Color.rgbValue(value); }
  public get a(): number { return this._a; }
  public set a(value: number) { this._a = Color.alphaValue(value); }

  public darker(value: number): this {
    this._r = Math.max(0, this.r - value);
    this._g = Math.max(0, this.g - value);
    this._b = Math.max(0, this.b - value);
    return this;
  }

  public lighter(value: number): this {
    this._r = Math.min(255, this.r + value);
    this._g = Math.min(255, this.g + value);
    this._b = Math.min(255, this.b + value);
    return this;
  }

}
