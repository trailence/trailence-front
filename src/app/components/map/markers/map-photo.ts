import * as L from 'leaflet';
import { MapComponent } from '../map.component';

export class MapPhoto {

  public static create(
    pos: L.LatLngExpression,
    dataUrl: string,
    width: number,
    height: number,
    badge: string | undefined,
  ): L.Marker {
    return L.marker(pos, {
      icon: L.icon({
        iconUrl: MapPhoto.createDataIconWithImage('#8080C0', dataUrl, width, height, badge),
        iconSize: [width, height + 15],
        iconAnchor: [width / 2, height + 15]
      }),
    });
  }

  public static createDataIconWithImage(
    borderColor: string = '#000000',
    image: string,
    width: number,
    height: number,
    badge: string | undefined,
  ): string {
    let svg = '<?xml version="1.0" encoding="utf-8"?>';
    svg += '<svg width="' + width + 'px" height="' + (height + 15) + 'px" viewBox="0 0 76 76" xmlns="http://www.w3.org/2000/svg">';
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
    return 'data:image/svg+xml;base64,' + btoa(svg);
  }

}
