export class DigitalScreenRenderer {
  private static DOT_SIZE = 32;
  private static DOT_MARGIN = 8;
  private static DIGIT_SIZE = 256;
  private static DIGIT_CROP = 48;
  public static readonly SVG_PARTS = {
    top: '<path d="M157.239 52.888c2.211-.003 5.325-1.213 6.95-2.699l24.4-22.31c1.627-1.488 1.157-2.694-1.05-2.694H68.996c-2.207 0-2.694 1.23-1.094 2.74l23.623 22.307c1.602 1.514 4.689 2.738 6.906 2.735l58.808-.079z" fill-rule="evenodd"/>',
    topLeft: '<path d="M89.19 56.053c1.618 1.5 2.93 4.501 2.93 6.714v44.353c0 2.209-1.275 5.253-2.848 6.8l-7.356 7.232c-1.572 1.546-4.225 1.666-5.933.26l-8.897-7.325c-1.704-1.403-3.086-4.335-3.086-6.53v-70.85c0-2.205 1.319-2.77 2.93-1.277l22.26 20.623z" fill-rule="evenodd"/>',
    topRight: '<path d="M163.819 107.882c.006 2.204 1.314 5.22 2.922 6.738l6.463 6.098c1.608 1.518 4.309 1.626 6.022.25l9.525-7.65c1.718-1.38 3.113-4.283 3.116-6.496l.078-71.27c.002-2.208-1.303-2.78-2.915-1.277l-22.432 20.91c-1.612 1.502-2.914 4.516-2.908 6.71l.129 45.987z" fill-rule="evenodd"/>',
    middle: '<path d="M92.039 119.524c1.561-1.56 4.618-2.841 6.834-2.863l56.433-.554c2.213-.022 5.297 1.204 6.887 2.738l7.074 6.82c1.59 1.535 1.51 3.937-.175 5.362l-6.575 5.564c-1.687 1.427-4.85 2.589-7.047 2.595l-55.465.16c-2.205.006-5.367-1.141-7.062-2.564l-6.812-5.717c-1.695-1.423-1.805-3.837-.241-5.4l6.149-6.141z" fill-rule="evenodd"/>',
    bottomLeft: '<path d="M75.293 136.104c1.741-1.359 4.574-1.377 6.334-.035l7.282 5.549c1.757 1.34 3.179 4.212 3.175 6.417l-.08 45.714c-.003 2.205-1.319 5.196-2.95 6.692l-22.11 20.28c-1.626 1.491-2.944.913-2.944-1.301v-70.501c0-2.21 1.411-5.103 3.152-6.461l8.141-6.354z" fill-rule="evenodd"/>',
    bottomRight: '<path d="M164.366 148.416c.015-2.212 1.4-5.156 3.1-6.58l6.35-5.323c1.698-1.422 4.56-1.565 6.387-.322l8.302 5.646c1.83 1.244 3.326 4.042 3.342 6.258l.51 70.57c.016 2.21-1.32 2.83-2.992 1.374l-22.313-19.423c-1.668-1.452-3.009-4.412-2.994-6.635l.308-45.565z" fill-rule="evenodd"/>',
    bottom: '<path d="M157.239 202.171c2.211.003 5.325 1.214 6.95 2.7l24.4 22.31c1.627 1.488 1.156 2.695-1.053 2.697l-118.63.092c-2.21.001-2.693-1.232-1.088-2.747l23.697-22.386c1.608-1.519 4.699-2.748 6.916-2.745l58.808.08z" fill-rule="evenodd"/>',
    dot: '<rect x="0" y="' + (228 - this.DOT_SIZE) + '" width="' + this.DOT_SIZE + '" height="' + this.DOT_SIZE + '"/>',
  };

  public static createDigitalSvgContentForDigit(digit: number): string {
    switch (digit) {
      case 0: return this.SVG_PARTS.top + this.SVG_PARTS.topRight + this.SVG_PARTS.bottomRight + this.SVG_PARTS.bottom + this.SVG_PARTS.bottomLeft + this.SVG_PARTS.topLeft;
      case 1: return this.SVG_PARTS.topRight + this.SVG_PARTS.bottomRight;
      case 2: return this.SVG_PARTS.top + this.SVG_PARTS.topRight + this.SVG_PARTS.middle + this.SVG_PARTS.bottomLeft + this.SVG_PARTS.bottom;
      case 3: return this.SVG_PARTS.top + this.SVG_PARTS.topRight + this.SVG_PARTS.bottomRight + this.SVG_PARTS.bottom + this.SVG_PARTS.middle;
      case 4: return this.SVG_PARTS.topLeft + this.SVG_PARTS.topRight + this.SVG_PARTS.middle + this.SVG_PARTS.bottomRight;
      case 5: return this.SVG_PARTS.top + this.SVG_PARTS.topLeft + this.SVG_PARTS.middle + this.SVG_PARTS.bottomRight + this.SVG_PARTS.bottom;
      case 6: return this.SVG_PARTS.top + this.SVG_PARTS.topLeft + this.SVG_PARTS.middle + this.SVG_PARTS.bottomRight + this.SVG_PARTS.bottom + this.SVG_PARTS.bottomLeft;
      case 7: return this.SVG_PARTS.top + this.SVG_PARTS.topRight + this.SVG_PARTS.bottomRight;
      case 8: return this.SVG_PARTS.top + this.SVG_PARTS.topRight + this.SVG_PARTS.bottomRight + this.SVG_PARTS.bottom + this.SVG_PARTS.bottomLeft + this.SVG_PARTS.topLeft + this.SVG_PARTS.middle;
      case 9: return this.SVG_PARTS.top + this.SVG_PARTS.topRight + this.SVG_PARTS.bottomRight + this.SVG_PARTS.bottom + this.SVG_PARTS.topLeft + this.SVG_PARTS.middle;
    }
    return '';
  }

  public static createDigitalSvg(value: number, maxFractionalDigits?: number, maxDigits?: number, height?: number): string {
    const digits: number[] = [Math.floor(value % 10)];
    let v = Math.floor(value / 10);
    while (v > 0) {
      digits.splice(0, 0, Math.floor(v % 10));
      v = Math.floor(v / 10);
    }
    const fractionals: number[] = [];
    if (maxFractionalDigits !== undefined) {
      if (maxDigits !== undefined && digits.length < maxDigits) {
        v = value * 10;
        for (let i = 0; i < maxFractionalDigits && digits.length + i < maxDigits; ++i) {
          fractionals.push(Math.floor(v % 10));
          v = v * 10;
        }
      }
    }
    const width = digits.length * (this.DIGIT_SIZE - this.DIGIT_CROP * 2) + (fractionals.length > 0 ? fractionals.length * (this.DIGIT_SIZE - this.DIGIT_CROP * 2) + this.DOT_SIZE + this.DOT_MARGIN * 2 : 0);
    let svg = '<svg ' + (height !== undefined ? 'height="' + height + 'px" ' : '') + 'fill="currentColor" viewBox="0 0 ' + width + ' 256" xmlns="http://www.w3.org/2000/svg">';
    for (let i = 0; i < digits.length; ++i) {
      svg += '<g transform="translate(' + ((this.DIGIT_SIZE - this.DIGIT_CROP * 2) * i - this.DIGIT_CROP) + ')">' + this.createDigitalSvgContentForDigit(digits[i]) + '</g>';
    }
    if (fractionals.length > 0) {
      svg += '<g transform="translate(' + ((this.DIGIT_SIZE - this.DIGIT_CROP * 2) * digits.length + this.DOT_MARGIN) + ')">' + this.SVG_PARTS.dot + '</g>';
      for (let i = 0; i < fractionals.length; ++i) {
        svg += '<g transform="translate(' + ((this.DIGIT_SIZE - this.DIGIT_CROP * 2) * (digits.length + i) + this.DOT_SIZE + (this.DOT_MARGIN * 2) - this.DIGIT_CROP) + ')">' + this.createDigitalSvgContentForDigit(Math.floor(fractionals[i])) + '</g>';
      }
    }
    svg += '</svg>';
    return svg;
  }
}
