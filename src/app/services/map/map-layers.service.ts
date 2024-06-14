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
      createDefaultLayer('osm', 'Open Street Map', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 19, '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>', 2),
      createIgnLayer('ign', 'IGN (France)', 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png', 19, 2),
      createIgnLayer('ign-sat', 'IGN Satellite (France)', 'ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg', 19, 2),
    ];
  }

  public getDefaultLayer(): string {
    return 'osm';
  }

}

function createDefaultLayer(
  name: string,
  displayName: string,
  urlTemplate: string,
  maxZoom: number,
  copyright: string,
  maxConcurrentRequests: number
): MapLayer {
  return {
    name,
    displayName,
    create: () => new L.TileLayer(urlTemplate, {
      maxZoom,
      attribution: copyright,
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
    maxConcurrentRequests,
  };
}

// TODO set boundaries for IGN map ?
function createIgnLayer(
  name: string,
  displayName: string,
  layerName: string,
  format: string,
  maxZoom: number,
  maxConcurrentRequests: number,
): MapLayer {
  const urlTemplate = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=' + layerName + '&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=' + encodeURIComponent(format);
  return {
    name,
    displayName,
    create: () => new L.TileLayer(urlTemplate, {
      maxZoom,
      attribution: '&copy; IGN France',
    }),
    getTileUrl: (layer, coords, crs) => {
      const data = {
        x: coords.x,
        y: coords.y,
        z: coords.z
      } as any;
      return L.Util.template(urlTemplate, data);
    },
    maxConcurrentRequests,
  };
}
