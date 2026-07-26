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
      const form = foreground.substring(underscore + 1).toLowerCase();
      switch (form) {
        case 'arch': return '<g transform="translate(' + x1 + ',' + y1 +') scale(' + (width / 15) + ',' + (height/15) + ')">' +
                            '<path style="fill:none;stroke-width:0.22;stroke-linecap:butt;stroke-linejoin:miter;stroke:' + color + ';stroke-opacity:1;stroke-miterlimit:10;" d="M 0.25 0.9 L 0.25 0.5 C 0.25 0.166667 0.75 0.166667 0.75 0.5 L 0.75 0.9 " transform="matrix(15,0,0,15,0,0)"/>' +
                            '</g>';
        case 'arrow': return '<path style="stroke:none;fill-rule:nonzero;fill:' + color + ';fill-opacity:1;" d="M 2.558594 10.71875 L 8.679688 10.71875 L 8.679688 14.121094 L 14.121094 8 L 8.679688 1.878906 L 8.679688 5.28125 L 2.558594 5.28125 L 2.558594 10.71875 " transform="translate(' + x1 + ',' + y1 +') scale(' + (width / 15) + ',' + (height/15) + ')"/>'
        case 'backslash': return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke-width="3" stroke="' + color + '"></line>';
        case 'bar': return '<rect x="' + x1 + '" y="' + (y1 + height / 3) + '" width="' + width + '" height="' + (height / 3) + '" fill="' + color + '"></rect>';
        case 'circle': return '<circle cx="' + (x1 + width / 2) + '" cy="' + (y1 + height / 2) + '" r="' + Math.min((width - 2) / 2, (height - 2) / 2) + '" stroke-width="3" stroke="' + color + '"></circle>';
        case 'corner': return '<path d="M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2 + ' L ' + x2 + ' ' + y1 + ' Z M ' + x1 + ' ' + y1 + '" fill="' + color + '"></path>';
        case 'corner_left': return '<path d="M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y1 + ' L ' + x1 + ' ' + y2 + ' Z M ' + x1 + ' ' + y1 + '" fill="' + color + '"></path>';
        case 'cross': return '<rect x="' + x1 + '" y="' + (y1 + height / 2 - 3) + '" width="' + width + '" height="6" fill="' + color + '"></rect>' +
                             '<rect x="' + (x1 + width / 2 - 3) + '" y="' + y1 + '" width="6" height="' + height + '" fill="' + color + '"></rect>';
        case 'diamond': return '<path d="M ' + x1 + ' ' + (y1 + height / 2) + ' L ' + (x1 + width / 2) + ' ' + (y1 + height / 6) + ' L ' + x2 + ' ' + (y1 + height / 2) + ' L ' + (x1 + width / 2) + ' ' + (y2 - height / 6) + '" fill="' + color + '"></path>';
        case 'diamond_line': return '<path d="M ' + x1 + ' ' + (y1 + height / 2) + ' L ' + (x1 + width / 2) + ' ' + (y1 + height / 6) + ' L ' + x2 + ' ' + (y1 + height / 2) + ' L ' + (x1 + width / 2) + ' ' + (y2 - height / 6) + ' L ' + x1 + ' ' + (y1 + height / 2) + '" stroke="' + color + '" stroke-width="3"></path>';
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
        case 'fork': return '<g stroke-width="3" stroke="' + color + '">' +
          '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + (x1 + width / 2.5) + '" y2="' + (y1 + height / 2) + '"></line>' +
          '<line x1="' + x1 + '" y1="' + y2 + '" x2="' + (x1 + width / 2.5) + '" y2="' + (y1 + height / 2) + '"></line>' +
          '<line x1="' + (x1 + width / 3) + '" y1="' + (y1 + height / 2) + '" x2="' + x2 + '" y2="' + (y1 + height / 2) + '"></line>' +
          '</g>';
        case 'frame': {
          const x = width / 8;
          const y = height / 8;
          return '<rect x="' + (x1 + x) + '" y="' + (y1 + y) + '" width="' + (width - x * 2) + '" height="' + (height - y * 2) + '" stroke="' + color + '"></rect>';
        }
        case 'lower': return '<rect x="' + x1 + '" y="' + (height / 2) + '" width="' + width + '" height="' + (height / 2) + '" fill="' + color + '"></rect>';
        case 'right_pointer':
        case 'pointer': return '<path d="M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + (y1 + height / 2) + ' L ' + x1 + ' ' + y2 + '" fill="' + color + '"></path>';
        case 'rectangle': return '<rect x="' + (x1 + width / 6) + '" y="' + (y1 + height / 6) + '" width="' + (width * 2 / 3) + '" height="' + (height * 2 / 3) + '" fill="' + color + '"></rect>';
        case 'rectangle_line': return '<rect x="' + (x1 + width / 6) + '" y="' + (y1 + height / 6) + '" width="' + (width * 2 / 3) + '" height="' + (height * 2 / 3) + '" stroke-width="3" stroke="' + color + '"></rect>';
        case 'shell': return '<path style="fill:none;stroke-width:0.06;stroke-linecap:butt;stroke-linejoin:miter;stroke:' + color + ';stroke-opacity:1;stroke-miterlimit:10;" d="M 0.5 0.1 L 0 0.3 M 0.5 0.1 L 0.1 0.5 M 0.5 0.1 L 0.2 0.65 M 0.5 0.1 L 0.35 0.8 M 0.5 0.1 L 0.5 0.85 M 0.5 0.1 L 0.65 0.8 M 0.5 0.1 L 0.8 0.65 M 0.5 0.1 L 0.9 0.5 M 0.5 0.1 L 1 0.3 " transform="matrix(' + width + ',0,0,' + height + ',' + x1 + ',' + y1 + ')"/>';
        case 'shell_modern': return '<path style="fill:none;stroke-width:0.06;stroke-linecap:butt;stroke-linejoin:miter;stroke:' + color + ';stroke-opacity:1;stroke-miterlimit:10;" d="M 0.1 0.5 L 0.3 0 M 0.1 0.5 L 0.5 0.1 M 0.1 0.5 L 0.65 0.2 M 0.1 0.5 L 0.8 0.35 M 0.1 0.5 L 0.85 0.5 M 0.1 0.5 L 0.8 0.65 M 0.1 0.5 L 0.65 0.8 M 0.1 0.5 L 0.5 0.9 M 0.1 0.5 L 0.3 1 " transform="matrix(' + width + ',0,0,' + height + ',' + x1 + ',' + y1 + ')"/>';
        case 'slash': return '<line x1="' + x1 + '" y1="' + y2 + '" x2="' + x2 + '" y2="' + y1 + '" stroke-width="3" stroke="' + color + '"></line>';
        case 'stripe': return '<rect x="' + (x1 + width / 4) + '" y="' + y1 + '" width="' + (width / 2) + '" height="' + height + '" fill="' + color + '"></rect>';
        case 'triangle': return '<path d="M ' + (x1 + width / 2) + ' ' + (y1 + height / 8) + ' L ' + (x2 - width / 8) + ' ' + (y2 - height / 8) + ' L ' + (x1 + width / 8) + ' ' + (y2 - height / 8) + '" fill="' + color + '"></path>';
        case 'triangle_line': return '<path d="M ' + (x1 + width / 2) + ' ' + (y1 + height / 8) + ' L ' + (x2 - width / 8) + ' ' + (y2 - height / 8) + ' L ' + (x1 + width / 8) + ' ' + (y2 - height / 8) + ' L ' + (x1 + width / 2) + ' ' + (y1 + height / 8) + '" stroke="' + color + '" stroke-width="3"></path>';
        case 'triangle_turn': return '<path d="M ' + (x1 + width / 2) + ' ' + (y2 - height / 8) + ' L ' + (x2 - width / 8) + ' ' + (y1 + height / 8) + ' L ' + (x1 + width / 8) + ' ' + (y1 + height / 8) + '" fill="' + color + '"></path>';
        case 'turned_t': return '<line x1="' + x1 + '" y1="' + (y2 - 2) + '" x2="' + x2 + '" y2="' + (y2 - 2) + '" stroke-width="3" stroke="' + color + '"></line><line x1="' + (x1 + width / 2) + '" y1="' + y1 + '" x2="' + (x1 + width / 2) + '" y2="' + (y2 - 2) + '" stroke-width="3" stroke="' + color + '"></line>';
        case 'upper': return '<rect x="' + x1 + '" y="' + y1 + '" width="' + width + '" height="' + (height / 2) + '" fill="' + color + '"></rect>';
        case 'wheel': return '<g transform="translate(' + x1 + ',' + y1 +') scale(' + (width / 15) + ',' + (height/15) + ')">' +
          '<path style="fill:none;stroke-width:1.30268;stroke-linecap:butt;stroke-linejoin:miter;stroke:' + color + ';stroke-opacity:1;stroke-miterlimit:4;" d="M 15.003633 1044.359862 C 15.003633 1048.204154 11.885658 1051.322129 8.041366 1051.322129 C 4.191886 1051.322129 1.073911 1048.204154 1.073911 1044.359862 C 1.073911 1040.51557 4.191886 1037.397596 8.041366 1037.397596 C 11.885658 1037.397596 15.003633 1040.51557 15.003633 1044.359862 Z M 15.003633 1044.359862 " transform="matrix(0.752943,0,0,0.752943,1.5,-778.819642)"/>' +
          '<path style="fill:none;stroke-width:1;stroke-linecap:butt;stroke-linejoin:miter;stroke:' + color + ';stroke-opacity:1;stroke-miterlimit:4;" d="M 9.213849 1044.359862 C 9.213849 1045.029111 8.669111 1045.573849 7.999862 1045.573849 C 7.330613 1045.573849 6.785875 1045.029111 6.785875 1044.359862 C 6.785875 1043.690613 7.330613 1043.145875 7.999862 1043.145875 C 8.669111 1043.145875 9.213849 1043.690613 9.213849 1044.359862 Z M 9.213849 1044.359862 " transform="matrix(0.752943,0,0,0.752943,1.5,-778.819642)"/>' +
          '<path style=" stroke:none;fill-rule:evenodd;fill:' + color + ';fill-opacity:1;" d="M 2.753906 7.078125 L 6.46875 7.078125 L 6.46875 7.996094 L 2.753906 7.996094 Z M 2.753906 7.078125 "/>' +
          '<path style=" stroke:none;fill-rule:evenodd;fill:' + color + ';fill-opacity:1;" d="M 8.664062 7.0625 L 12.382812 7.0625 L 12.382812 7.980469 L 8.664062 7.980469 Z M 8.664062 7.0625 "/>' +
          '<path style=" stroke:none;fill-rule:evenodd;fill:' + color + ';fill-opacity:1;" d="M 5.515625 3.128906 L 7.371094 6.347656 L 6.578125 6.808594 L 4.71875 3.589844 Z M 5.515625 3.128906 "/>' +
          '<path style=" stroke:none;fill-rule:evenodd;fill:' + color + ';fill-opacity:1;" d="M 8.480469 8.242188 L 10.335938 11.460938 L 9.542969 11.921875 L 7.6875 8.703125 Z M 8.480469 8.242188 "/>' +
          '<path style=" stroke:none;fill-rule:evenodd;fill:' + color + ';fill-opacity:1;" d="M 10.320312 3.582031 L 8.464844 6.800781 L 7.671875 6.34375 L 9.527344 3.125 Z M 10.320312 3.582031 "/>' +
          '<path style=" stroke:none;fill-rule:evenodd;fill:' + color + ';fill-opacity:1;" d="M 7.382812 8.710938 L 5.523438 11.929688 L 4.730469 11.46875 L 6.585938 8.253906 Z M 7.382812 8.710938 "/>' +
          '</g>';
        case 'x': return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke-width="3" stroke="' + color + '"></line><line x1="' + x1 + '" y1="' + y2 + '" x2="' + x2 + '" y2="' + y1 + '" stroke-width="3" stroke="' + color + '"></line>';

      }
      Console.warn('unknown oscm type of foreground', foreground);
    } else {
      Console.warn('unknown oscm foreground color', foreground);
    }
    //return '<image x="' + x1 + '" y="' + y1 + '" width="' + width + '" height="' + height + '" preserveAspectRatio="" href="https://www.wanderreitkarte.de/symbols/icon_' + foreground + '.png" />';
    // https://hiking.waymarkedtrails.org/osmc_symbols.html
    // https://github.com/waymarkedtrails/waymarked-trails-site/tree/df0194b845c92e92cc0433779544c321f3425d0e/frontend/static/img/osmc/foreground
    return '<image x="' + (x1 - 2) + '" y="' + (y1 - 2) + '" width="' + (width + 4) + '" height="' + (height + 4) + '" preserveAspectRatio="" href="https://hiking.waymarkedtrails.org/api/v1/symbols/from_tags/NAT?osmc:symbol=::' + foreground + '" />';
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
