export class Color {

  public r: number;
  public g: number;
  public b: number;
  public a: number;

  constructor(s: string) {
    if (s.startsWith('#')) {
      this.r = Number.parseInt(s.substring(1, 3), 16);
      this.g = Number.parseInt(s.substring(3, 5), 16);
      this.b = Number.parseInt(s.substring(5, 7), 16);
      this.a = 1;
    } else if (s.startsWith('rgb(')) {
      const i = s.indexOf(')');
      const elements = s.substring(4, i).split(',');
      this.r = Number.parseInt(elements[0], 10);
      this.g = Number.parseInt(elements[1], 10);
      this.b = Number.parseInt(elements[2], 10);
      this.a = 1;
    } else if (s.startsWith('rgba(')) {
      const i = s.indexOf(')');
      const elements = s.substring(5, i).split(',');
      this.r = Number.parseInt(elements[0], 10);
      this.g = Number.parseInt(elements[1], 10);
      this.b = Number.parseInt(elements[2], 10);
      this.a = Number.parseFloat(elements[3]);
    } else {
      switch (s) {
        case 'red': this.r = 255; this.g = 0; this.b = 0; this.a = 1; break;
        case 'blue': this.r = 0; this.g = 0; this.b = 255; this.a = 1; break;
        default: throw new Error('Unexpected color format: ' + s);
      }
    }
  }

  public toString(): string {
    if (this.a === 1) {
      return 'rgb(' + this.r + ',' + this.g + ',' + this.b + ')';
    }
    return 'rgba(' + this.r + ',' + this.g + ',' + this.b + ',' + this.a + ')';
  }

  public copy(): Color {
    return new Color(this.toString());
  }

  public setRed(value: number): this {
    this.r = value;
    return this;
  }

  public setGreen(value: number): this {
    this.g = value;
    return this;
  }

  public setBlue(value: number): this {
    this.b = value;
    return this;
  }

  public setAlpha(value: number): this {
    this.a = value;
    return this;
  }

  public darker(value: number): this {
    this.r = Math.max(0, this.r - value);
    this.g = Math.max(0, this.g - value);
    this.b = Math.max(0, this.b - value);
    return this;
  }

}
