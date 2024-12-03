import { Injectable } from '@angular/core';
import { IdGenerator } from 'src/app/utils/component-utils';
import { Console } from 'src/app/utils/console';
import { XmlUtils } from 'src/app/utils/xml-utils';

@Injectable({providedIn: 'root'})
export class OsmcSymbolService {

  public generateSymbol(symbol: string): string { // NOSONAR
    const elements = symbol.split(':');
    if (elements.length < 2) return '';
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

    let svg = '<svg width="24px" height="24px" viewBox="0 0 24 24" fill="none">';
    const back = this.oscmDrawBackground(background);
    if (back) {
      svg += back.svg;
      if (back.clip)
        svg += back.clip;
    }
    let front = foreground ? this.oscmDrawForeground(foreground) : undefined;
    let front2 = foreground2 ? this.oscmDrawForeground(foreground2) : undefined;
    if ((!front || front.length === 0) && front2 && front2.length > 0) {
      front = front2;
      front2 = undefined;
    }
    if (front) {
      if (back?.clipId)
        svg += '<g clip-path="url(#' + back.clipId + '">';
      if (front2) {
        svg += '<g transform="translate(-2 5) scale(0.6)">' + front + '</g>' +
               '<g transform="translate(11 5) scale(0.6)">' + front2 + '</g>';
      } else {
        svg += front;
      }
    }
    if (text && textcolor) {
      const color = this.oscmColor(textcolor);
      if (color)
        svg += '<text x="12" y="16" style="font-size: 11px; font-weight: bold; font-family: monospace; text-anchor: middle; fill: ' + color + '">' + XmlUtils.escapeHtml(text) + '</text>'
    }
    svg += '</svg>';
    return svg;
  }

  private oscmDrawBackground(background: string): { svg: string, clip?: string, clipId?: string } | undefined {
    if (background.length === 0) return undefined;
    const underscore = background.indexOf('_');
    if (underscore < 0) {
      const color = this.oscmColor(background);
      if (color)
        return {
          svg: '<rect x="0" y="0" width="24" height="24" fill="' + color + '"></rect>',
        };
    } else {
      const color = this.oscmColor(background.substring(0, underscore));
      const shape = background.substring(underscore + 1);
      if (color) {
        const id = IdGenerator.generateId();
        switch (shape) {
          case 'round': return {
            svg: '<circle cx="12" cy="12" r="12" fill="' + color + '"></circle>',
            clip: '<clipPath id="' + id + '"><circle cx="12" cy="12" r="12"></circle></clipPath>',
            clipId: id
          };
          case 'circle': return {
            svg: '<circle cx="12" cy="12" r="12" stroke="' + color + '"></circle>',
            clip: '<clipPath id="' + id + '"><circle cx="12" cy="12" r="12"></circle></clipPath>',
            clipId: id
          };
          case 'frame': return {
            svg: '<rect x="0" y="0" width="24" height="24" stroke="' + color + '"></rect>',
            clip: '<clipPath id="' + id + '"><rect x="1" y="1" width="22" height="22" /></clipPath>'
          };
        }
      }
      Console.warn('unknown osmc background', background);
    }
    return undefined;
  }

  private oscmDrawForeground(foreground: string): string | undefined {
    if (foreground.length === 0) return undefined;
    const underscore = foreground.indexOf('_');
    if (underscore <= 0) return undefined;
    const color = this.oscmColor(foreground.substring(0, underscore));
    if (color) {
      switch (foreground.substring(underscore + 1)) {
        case 'bar': return '<rect x="0" y="8" width="24" height="8" fill="' + color + '"></rect>';
        case 'dot': return '<circle cx="12" cy="12" r="6" fill="' + color + '"></circle>';
        case 'dots': return '<circle cx="4" cy="12" r="2" fill="' + color + '"></circle>' +
                            '<circle cx="10" cy="12" r="2" fill="' + color + '"></circle>' +
                            '<circle cx="16" cy="12" r="2" fill="' + color + '"></circle>';
        case 'lower': return '<rect x="0" y="12" width="24" height="12" fill="' + color + '"></rect>';
        case 'stripe': return '<rect x="6" y="0" width="12" height="24" fill="' + color + '"></rect>';
        case 'diamond': return '<rect x="10.5" y="-8" width="14" height="14" transform="rotate(45)" fill="' + color + '"></rect>';
        case 'frame': return '<rect x="3" y="3" width="18" height="18" stroke="' + color + '"></rect>';
      }
      Console.warn('unknown oscm type of foreground', foreground);
    } else {
      Console.warn('unknown oscm foreground color', foreground);
    }
    return '<image x="0" y="0" width="24" height="24" preserveAspectRatio="" href="https://www.wanderreitkarte.de/symbols/icon_' + foreground + '.png" />';
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
