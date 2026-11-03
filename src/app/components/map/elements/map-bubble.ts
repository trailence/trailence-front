import { EarthBBox } from '@trailence/utils/latlng';
import { MAP_TRACKS_LAYER, MapElement } from '../map-element';
import { Observable, of } from 'rxjs';
import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitive } from '../primitives/primitive';
import { SvgBoundsPrimitive } from '../primitives/svg';

export class MapBubble extends MapElement {

  constructor(
    id: string,
    public readonly bubbleBounds: EarthBBox, // used to draw
    public readonly fitBounds: EarthBBox, // used to fit map
    bgColor: string,
    borderColor: string,
    text: string,
    textSize: number,
    textColor: string,
    public readonly data?: any,
  ) {
    super('bubble$' + id, {layer: MAP_TRACKS_LAYER});
    this.svg = MapBubble.createSvg(256, bgColor, borderColor, text, textSize, textColor);
  }

  private readonly svg: SVGSVGElement;

  public static createSvg(size: number, bgColor: string, borderColor: string, text: string, textSize: number, textColor: string): SVGSVGElement {
    const e = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    e.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    e.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    let svg = '';
    svg += '<circle cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + (size / 2 - 1) + '" fill="' + bgColor + '" stroke="' + borderColor + '" />';
    svg += '<text x="' + (size / 2) + '" y="' + (size / 2 + textSize / 10) + '" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="' + textSize + 'px" font-weight="bold" fill="' + textColor + '">' + text + '</text>';
    e.innerHTML = svg;
    return e;
  }

  private _primitive?: SvgBoundsPrimitive<any>;
  protected override createPrimitives$(renderer: MapRenderer): Observable<MapPrimitive<any, MapRenderer>[]> {
    if (this._primitive) {
      this.events.unbind(this._primitive);
    }
    this._primitive = renderer.createSvgBounds(this.id, this.bubbleBounds, this.svg, {});
    this.events.bind(this._primitive);
    return of([this._primitive]);
  }

}
