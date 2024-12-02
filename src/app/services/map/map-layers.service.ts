import { Injectable, Injector } from '@angular/core';
import * as L from 'leaflet';
import { handleMapOffline } from './map-tiles-layer-offline';
import { NetworkService } from '../network/network.service';
import { OfflineMapService } from './offline-map.service';
import { ExtensionsService } from '../database/extensions.service';

const LOCALSTORAGE_KEY_DARKMAP = 'trailence.dark-map';

export interface MapLayer {

  name: string;
  displayName: string;

  create(): L.TileLayer;

  getTileUrl(layer: L.TileLayer, coords: L.Coords, crs: L.CRS): string;

  maxConcurrentRequests: number;
  doNotUseNativeHttp: boolean;

}

@Injectable({
  providedIn: 'root'
})
export class MapLayersService {

  public layers: MapLayer[];
  public possibleLayers: string[];

  private _darkMap = false;

  constructor(injector: Injector) {
    this.layers = [
      createDefaultLayer(injector, 'osm', 'Open Street Map', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 19, '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>', 2, true),
      createDefaultLayer(injector, 'osmfr', 'Open Street Map French', 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', 19, '&copy; <a href="http://www.openstreetmap.fr">OpenStreetMap</a>', 2, false),
      //createDefaultLayer('osmch', 'Open Street Map Swiss', 'https://tile.osm.ch/osm-swiss-style/{z}/{x}/{y}.png', 19, '&copy; <a href="https://sosm.ch/">Swiss OpenStreetMap Association</a>', 2, false),
      createDefaultLayer(injector, 'otm', 'Open Topo Map', 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', 17, '&copy; <a href="http://www.opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)', 2, false),
      createIgnLayer(injector, 'ign', 'IGN (France)', 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png', 19, 2),
      createIgnLayer(injector, 'ign-sat', 'IGN Satellite (France)', 'ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg', 19, 2),
      //createDefaultLayer('stadia-sat', 'Stadia Satellite', 'https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg', 20, '&copy; CNES, Distribution Airbus DS, © Airbus DS, © PlanetObserver (Contains Copernicus Data) | &copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', 2),
    ];
    let previousTfoKey: string | undefined = undefined;
    injector.get(ExtensionsService).getExtensions$().subscribe(
      extensions => {
        const thunderforest = extensions.find(e => e.extension === 'thunderforest.com');
        let index = this.layers.findIndex(l => l.name === 'tfo');
        if (thunderforest?.data['apikey']) {
          if (thunderforest?.data['apikey'] !== previousTfoKey) {
            if (index >= 0) {
              this.layers.splice(index, 1);
            }
            this.layers.push(createDefaultLayer(injector, 'tfo', 'Thunderforest Outdoors', 'https://{s}.tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=' + thunderforest.data['apikey'], 22, 'Maps &copy; <a href="https://www.thunderforest.com/">Thunderforest</a>, Data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>', 2, false));
          }
        } else if (index >= 0) {
          this.layers.splice(index, 1);
        }
        previousTfoKey = thunderforest?.data['apikey'];
      }
    );
    this.possibleLayers = [
      'osm', 'osmfr', 'otm', 'ign', 'ign-sat',
      'tfo'
    ];
    const darkmap = localStorage.getItem(LOCALSTORAGE_KEY_DARKMAP);
    if (darkmap) this.toggleDarkMap();
  }

  public getDefaultLayer(): string {
    return 'osm';
  }

  public get darkMapEnabled(): boolean { return this._darkMap; }

  public toggleDarkMap(): void {
    this._darkMap = !this._darkMap;
    if (this._darkMap) {
      localStorage.setItem(LOCALSTORAGE_KEY_DARKMAP, "true");
      window.document.body.classList.add('dark-map');
    } else {
      localStorage.removeItem(LOCALSTORAGE_KEY_DARKMAP);
      window.document.body.classList.remove('dark-map');
    }
  }

}

function createDefaultLayer( // NOSONAR
  injector: Injector,
  name: string,
  displayName: string,
  urlTemplate: string,
  maxZoom: number,
  copyright: string,
  maxConcurrentRequests: number,
  doNotUseNativeHttp: boolean,
  additionalOptions: any = {},
): MapLayer {
  return {
    name,
    displayName,
    create: () => handleMapOffline(name, new L.TileLayer(urlTemplate, {
      maxZoom,
      attribution: copyright,
      id: name,
      ...additionalOptions
    }), injector.get(NetworkService), injector.get(OfflineMapService)),
    getTileUrl(layer, coords, crs) {
      const data = {
        r: L.Browser.retina ? '@2x' : '',
        s: (layer as any)._getSubdomain(coords),
        x: coords.x,
        y: coords.y,
        z: coords.z
      } as any;
      if (!crs.infinite && (layer as any)._globalTileRange) {
        const invertedY = (layer as any)._globalTileRange.max.y - coords.y;
        if (layer.options.tms) {
          data['y'] = invertedY;
        }
        data['-y'] = invertedY;
      }
      return L.Util.template((layer as any)._url, L.Util.extend(data, layer.options));
    },
    maxConcurrentRequests,
    doNotUseNativeHttp
  };
}

// TODO set boundaries for IGN map ?
function createIgnLayer(
  injector: Injector,
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
    create: () => handleMapOffline(name, new L.TileLayer(urlTemplate, {
      maxZoom,
      attribution: '&copy; IGN France',
    }), injector.get(NetworkService), injector.get(OfflineMapService)),
    getTileUrl: (layer, coords, crs) => {
      const data = {
        x: coords.x,
        y: coords.y,
        z: coords.z
      } as any;
      return L.Util.template(urlTemplate, data);
    },
    maxConcurrentRequests,
    doNotUseNativeHttp: false,
  };
}
