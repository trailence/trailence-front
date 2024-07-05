export class Color {

  public r: number;
  public g: number;
  public b: number;
  public a: number;

  constructor(s: string) {
    if (s.startsWith('#')) {
      this.r = parseInt(s.substring(1, 3), 16);
      this.g = parseInt(s.substring(3, 5), 16);
      this.b = parseInt(s.substring(5, 7), 16);
      this.a = 1;
    } else if (s.startsWith('rgb(')) {
      const i = s.indexOf(')');
      const elements = s.substring(4, i).split(',');
      this.r = parseInt(elements[0], 10);
      this.g = parseInt(elements[1], 10);
      this.b = parseInt(elements[2], 10);
      this.a = 1;
    } else if (s.startsWith('rgba(')) {
      const i = s.indexOf(')');
      const elements = s.substring(5, i).split(',');
      this.r = parseInt(elements[0], 10);
      this.g = parseInt(elements[1], 10);
      this.b = parseInt(elements[2], 10);
      this.a = parseFloat(elements[3]);
    } else {
      throw new Error('Unexpected color format: ' + s);
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

  public setRed(value: number): Color {
    this.r = value;
    return this;
  }

  public setGreen(value: number): Color {
    this.g = value;
    return this;
  }

  public setBlue(value: number): Color {
    this.b = value;
    return this;
  }

  public setAlpha(value: number): Color {
    this.a = value;
    return this;
  }

}
