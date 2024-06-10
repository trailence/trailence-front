import { Injectable } from '@angular/core';
import * as L from 'leaflet';

export interface MapLayer {

  name: string;
  displayName: string;

  create(): L.TileLayer;

  getTileUrl(layer: L.TileLayer, coords: L.Coords, crs: L.CRS): string;

  maxConcurrentRequests: number;

}

@Injectable({
  providedIn: 'root'
})
export class MapLayersService {

  public layers: MapLayer[];

  constructor() {
    this.layers = [
      {
        name: 'osm',
        displayName: 'Open Street Map',
        create: () => new L.TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }),
        getTileUrl(layer, coords, crs) {
          const data = {
            r: L.Browser.retina ? '@2x' : '',
            s: (layer as any)._getSubdomain(coords),
            x: coords.x,
            y: coords.y,
            z: coords.z
          } as any;
          if (!crs.infinite) {
            const invertedY = (layer as any)._globalTileRange.max.y - coords.y;
			      if (layer.options.tms) {
				      data['y'] = invertedY;
			      }
			      data['-y'] = invertedY;
          }
          return L.Util.template((layer as any)._url, L.Util.extend(data, layer.options));
        },
        maxConcurrentRequests: 2,
      }
    ];
  }

  public getDefaultLayer(): string {
    return 'osm';
  }

}
