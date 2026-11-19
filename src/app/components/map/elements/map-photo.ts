import { EarthPoint } from '@trailence/utils/latlng';
import { MAP_PHOTOS_LAYER, MapElement } from '../map-element';
import { Point2D } from '@trailence/utils/geometry-utils';
import { Observable, of } from 'rxjs';
import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitive } from '../primitives/primitive';
import { IconPrimitive } from '../primitives/icon';

export class MapPhoto extends MapElement<null> {

  constructor(
    id: string,
    public readonly position: EarthPoint,
    public readonly photoUrl: string,
    public readonly photoSize: Point2D,
    public readonly badge: string | undefined = undefined,
  ) {
    super(id, {layer: MAP_PHOTOS_LAYER});
  }

  public override readonly fitBounds$ = of(undefined);

  protected override createPrimitives$(renderer: MapRenderer): Observable<{ primitive: MapPrimitive<any, MapRenderer, any>; eventBinding: null | undefined; }[]> {
    return of([{
      primitive: this.createMarker(renderer),
      eventBinding: null,
    }]);
  }

  private createMarker(renderer: MapRenderer): IconPrimitive<any, any> {
    return renderer.createIcon(
      this.id,
      this.position,
      {
        icon: MapPhoto.createSvgIconWithImage('#8080C0', this.photoUrl, this.photoSize.x, this.photoSize.y, this.badge),
        iconAnchor: 'bottom-center',
        iconOriginalSize: {x: this.photoSize.x, y: this.photoSize.y + 15},
        iconRenderSize: {x: this.photoSize.x, y: this.photoSize.y + 15},
      }
    )
  }

  public static createSvgIconWithImage(
    borderColor: string,
    image: string,
    width: number,
    height: number,
    badge: string | undefined,
  ): string {
    let svg = '<?xml version="1.0" encoding="utf-8"?>';
    svg += '<svg width="' + width + 'px" height="' + (height + 15) + 'px" viewBox="0 0 ' + width + ' ' + (height + 15) + '" xmlns="http://www.w3.org/2000/svg">';
    svg += '<defs>';
    svg += '<clipPath id="bubble">';
    svg += '<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="10"/>'
    svg += '</clipPath>';
    if (badge) {
      svg += '<filter x="-0.25" y="-0.1" width="1.5" height="1.2" id="text-bg">';
      svg += '<feFlood flood-color="#008000C0" result="bg" />';
      svg += '<feMerge>';
      svg += '<feMergeNode in="bg"/>';
      svg += '<feMergeNode in="SourceGraphic"/>';
      svg += '</feMerge>';
      svg += '</filter>';
    }
    svg += '</defs>';
    svg += '<image href="' + image + '" x="0" y="0" width="' + width + '" height="' + height + '" clip-path="url(#bubble)"/>'
    svg += '<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="10" stroke="' + borderColor + '" stroke-width="2" fill="none" />';
    svg += '<polygon points="' + (width / 2 - 5) + ',' + height + ' ' + (width / 2) + ',' + (height + 15) + ' ' + (width / 2 + 5) + ',' + height + '" fill="' + borderColor + '" />';
    if (badge) {
      svg += '<text filter="url(#text-bg)" x="' + (width - 2) + '" y="4" dominant-baseline="hanging" text-anchor="end" font-family="Arial" font-size="10px" stroke="#000000">' + badge + '</text>';
    }
    svg += '</svg>';
    return svg;
  }

}
