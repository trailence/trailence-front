import { Injectable, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { IdGenerator } from 'src/app/utils/component-utils';
import { Console } from 'src/app/utils/console';
import { XmlUtils } from 'src/app/utils/xml-utils';

@Injectable({providedIn: 'root'})
export class OsmcSymbolService {

  constructor(private readonly sanitizer: DomSanitizer) {}

  public generateSvg(symbol: string): string | undefined {
    const content = this.generateSvgContent(symbol, 0, 23, 0, 23);
    if (!content) return undefined;
    return '<svg width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' + content + '</svg>';
  }

  public generateSvgContent(symbol: string, x1: number, x2: number, y1: number, y2: number): string | undefined { // NOSONAR
    const elements = symbol.split(':');
    if (elements.length < 2) {
      Console.warn('Invalid OSMC', symbol);
      return undefined;
    }
    const background = elements[1];
    const foreground = elements.length > 2 ? elements[2] : undefined;
    let text: string | undefined;
    let textcolor: string | undefined;
    let foreground2: string | undefined;
    if (elements.length === 5 && this.oscmColor(elements[4])) {
      foreground2 = undefined;
      text = elements[3];
      textcolor = elements[4];
    } else {
      let index = 3;
      foreground2 = foreground && foreground.length > 0 && elements.length > index ? elements[3] : undefined;
      if (foreground2 !== undefined) index++;
      text = elements.length > index ? elements[index] : undefined;
      textcolor = elements.length > index + 1 ? elements[index + 1] : undefined;
    }

    let svg = '';
    const back = this.oscmDrawBackground(background, x1, x2, y1, y2);
    if (back) {
      svg += back.svg;
      if (back.clip)
        svg += back.clip;
    }
    let front = foreground ? this.oscmDrawForeground(foreground, x1, x2, y1, y2) : undefined;
    let front2 = foreground2 ? this.oscmDrawForeground(foreground2, x1, x2, y1, y2) : undefined;
    if ((!front || front.length === 0) && front2 && front2.length > 0) {
      front = front2;
      front2 = undefined;
    }
    if (front) {
      if (back?.clipId)
        svg += '<g clip-path="url(#' + back.clipId + '">';
      if (front2) {
        if (foreground2?.endsWith('_lower')) {
          svg += '<g>' + front + '</g>' +
                '<g>' + front2 + '</g>';
        } else {
          // TODO use x1, x2, y1, y2
          svg += '<g transform="translate(-2 5) scale(0.6)">' + front + '</g>' +
                '<g transform="translate(11 5) scale(0.6)">' + front2 + '</g>';
        }
      } else {
        svg += front;
      }
    }
    if (text && textcolor) {
      const color = this.oscmColor(textcolor);
      if (color)
        svg += '<text x="' + (x2 - x1 + 1) / 2 + '" y="' + ((y2 - y1 + 1) / 2 + 3) + '" style="font-size: ' + (Math.floor(y2 - y1) / 2.25) + 'px; font-weight: bold; font-family: monospace; text-anchor: middle; fill: ' + color + '">' + (this.sanitizer.sanitize(SecurityContext.HTML, XmlUtils.escapeHtml(text)) ?? '') + '</text>'
    }
    if (svg.length === 0 && elements[0].length > 0) {
      const color = this.oscmColor(elements[0]);
      if (color)
        svg = '<rect x="' + x1 + '" y="' + (y1 + (y2 - y1 + 1) / 4) + '" width="' + (x2 - x1 + 1) + '" height="' + ((y2 - y1 + 1) / 2 - 1) + '" fill="' + color + '"></rect>';
    }
    if (svg.length === 0) {
      Console.warn('Empty OMSC', symbol);
      return undefined;
    }
    return svg;
  }

  private oscmDrawBackground(background: string, x1: number, x2: number, y1: number, y2: number): { svg: string, clip?: string, clipId?: string } | undefined {
    if (background.length === 0) return undefined;
    const underscore = background.indexOf('_');
    const width = x2 - x1 + 1;
    const height = y2 - y1 + 1;
    const radius = Math.min(width / 2, height / 2)
    if (underscore < 0) {
      const color = this.oscmColor(background);
      if (color)
        return {
          svg: '<rect x="' + x1 + '" y="' + y1 + '" width="' + width + '" height="' + height + '" fill="' + color + '"></rect>',
        };
    } else {
      const color = this.oscmColor(background.substring(0, underscore));
      const shape = background.substring(underscore + 1);
      if (color) {
        const id = IdGenerator.generateId();
        switch (shape) {
          case 'round': return {
            svg: '<circle cx="' + (x1 + width / 2) + '" cy="' + (y1 + height / 2)  + '" r="' + radius + '" fill="' + color + '"></circle>',
            clip: '<clipPath id="' + id + '"><circle cx="' + (x1 + width / 2) + '" cy="' + (y1 + height / 2)  + '" r="' + radius + '"></circle></clipPath>',
            clipId: id
          };
          case 'circle': return {
            svg: '<circle cx="' + (x1 + width / 2) + '" cy="' + (y1 + height / 2)  + '" r="' + radius + '" stroke="' + color + '"></circle>',
            clip: '<clipPath id="' + id + '"><circle cx="' + (x1 + width / 2) + '" cy="' + (y1 + height / 2)  + '" r="' + radius + '"></circle></clipPath>',
            clipId: id
          };
          case 'frame': return {
            svg: '<rect x="' + x1 + '" y="' + y1 + '" width="' + width + '" height="' + height + '" stroke="' + color + '"></rect>',
            clip: '<clipPath id="' + id + '"><rect x="' + (x1 + 1) + '" y="' + (y1 + 1) + '" width="' + (width - 2) + '" height="' + (height - 2) + '" /></clipPath>'
          };
        }
      }
      Console.warn('unknown osmc background', background);
    }
    return undefined;
  }

  private oscmDrawForeground(foreground: string, x1: number, x2: number, y1: number, y2: number): string | undefined {
    if (foreground.length === 0) return undefined;
    const underscore = foreground.indexOf('_');
    if (underscore <= 0) return undefined;
    const width = x2 - x1 + 1;
    const height = y2 - y1 + 1;
    const color = this.oscmColor(foreground.substring(0, underscore));
    if (color) {
      switch (foreground.substring(underscore + 1)) {
        case 'bar': return '<rect x="' + x1 + '" y="' + (y1 + height / 3) + '" width="' + width + '" height="' + (height / 3) + '" fill="' + color + '"></rect>';
        case 'dot': return '<circle cx="' + (x1 + width / 2) + '" cy="' + (y1 + height / 2) + '" r="' + Math.min(width / 4, height / 4) + '" fill="' + color + '"></circle>';
        case 'dots': {
          const r = Math.max(1, Math.min(width / 12, height / 12));
          const cx1 = x1 + r * 2;
          const cx3 = x1 + width - r * 2 - 1;
          const cx2 = cx1 + (cx3 - cx1) / 2;
          return '<circle cx="' + cx1 + '" cy="' + (y1 + height / 2) + '" r="' + r + '" fill="' + color + '"></circle>' +
                 '<circle cx="' + cx2 + '" cy="' + (y1 + height / 2) + '" r="' + r + '" fill="' + color + '"></circle>' +
                 '<circle cx="' + cx3 + '" cy="' + (y1 + height / 2) + '" r="' + r + '" fill="' + color + '"></circle>';
        }
        case 'lower': return '<rect x="' + x1 + '" y="' + (height / 2) + '" width="' + width + '" height="' + (height / 2) + '" fill="' + color + '"></rect>';
        case 'upper': return '<rect x="' + x1 + '" y="' + y1 + '" width="' + width + '" height="' + (height / 2) + '" fill="' + color + '"></rect>';
        case 'stripe': return '<rect x="' + (x1 + width / 4) + '" y="' + y1 + '" width="' + (width / 2) + '" height="' + height + '" fill="' + color + '"></rect>';
        case 'diamond': return '<rect x="10.5" y="-8" width="14" height="14" transform="rotate(45)" fill="' + color + '"></rect>';
        case 'frame': {
          const x = width / 8;
          const y = height / 8;
          return '<rect x="' + (x1 + x) + '" y="' + (y1 + y) + '" width="' + (width - x * 2) + '" height="' + (height - y * 2) + '" stroke="' + color + '"></rect>';
        }
      }
      Console.warn('unknown oscm type of foreground', foreground);
    } else {
      Console.warn('unknown oscm foreground color', foreground);
    }
    return '<image x="' + x1 + '" y="' + y1 + '" width="' + width + '" height="' + height + '" preserveAspectRatio="" href="https://www.wanderreitkarte.de/symbols/icon_' + foreground + '.png" />';
  }

  private oscmColor(color: string): string | undefined {
    switch (color) {
      case 'white':
      case 'black':
      case 'blue':
      case 'brown':
      case 'green':
      case 'orange':
      case 'purple':
      case 'red':
      case 'yellow':
        return color;
    }
    Console.warn('unknown oscm color', color);
    return undefined;
  }

}
