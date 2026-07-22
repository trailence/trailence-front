import { Injectable, Injector } from '@angular/core';
import * as L from 'leaflet';
import { handleMapOffline } from './map-tiles-layer-offline';
import { NetworkService } from '../network/network.service';
import { OfflineMapService } from './offline-map.service';
import { ExtensionsService } from '../database/extensions.service';
import { Observable } from 'rxjs';
import { HttpService } from '../http/http.service';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

const LOCALSTORAGE_KEY_DARKMAP = 'trailence.dark-map';

export interface MapLayer {

  name: string;
  displayName: string;
  exampleUrl: string;
  regional: RegionalSettings | undefined;
  templateUrl: string;

  create(): L.TileLayer;

  getTileUrl(layer: L.TileLayer, coords: L.Coords, crs?: L.CRS): string;

  maxConcurrentRequests: number;
  doNotUseNativeHttp: boolean;
  tileSize: number;
  tileMimeFormat: string;

}

export interface RegionalSettings {
  code: string;
}

@Injectable({
  providedIn: 'root'
})
export class MapLayersService {

  public layers: MapLayer[];
  public possibleLayers: string[];
  public overlays: MapLayer[];

  private _darkMap = false;

  constructor(private readonly injector: Injector) {
    this.layers = [
      createDefaultLayer(injector, 'osm', 'Open Street Map', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 19, '&copy; <a href="http://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>', 2, true, 'image/png', environment.assetsUrl + '/map-layers/osm.png'),
      //createDefaultLayer(injector, 'osmfr', 'Open Street Map French', 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', 19, '&copy; <a href="http://www.openstreetmap.fr" target="_blank">OpenStreetMap</a>', 2, false, 'image/png'),
      //createDefaultLayer('osmch', 'Open Street Map Swiss', 'https://tile.osm.ch/osm-swiss-style/{z}/{x}/{y}.png', 19, '&copy; <a href="https://sosm.ch/" target="_blank">Swiss OpenStreetMap Association</a>', 2, false, 'image/png'),
      createDefaultLayer(injector, 'otm', 'Open Topo Map', 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', 17, '&copy; <a href="http://www.opentopomap.org" target="_blank">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank">CC-BY-SA</a>)', 2, false, 'image/png', environment.assetsUrl + '/map-layers/otm.png'),
      createDefaultLayer(injector, 'cyclosm', 'CyclOSM', 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', 20, '<a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases" target="_blank">CyclOSM</a> Map data &copy; <a href="http://www.openstreetmap.org" target="_blank">OpenStreetMap</a> contributors', 2, true, 'image/png', environment.assetsUrl + '/map-layers/cyclosm.png'),
      createIgnLayer(injector, 'ign', 'IGN', 'https://data.geopf.fr/wmts', 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'PM', 'normal', 'image/png', 19, 5, '&copy; IGN France', environment.assetsUrl + '/map-layers/ign.png', {code: 'fr'}),
      createIgnLayer(injector, 'ign-sat', 'IGN Satellite', 'https://data.geopf.fr/wmts', 'ORTHOIMAGERY.ORTHOPHOTOS', 'PM', 'normal', 'image/jpeg', 19, 5, '&copy; IGN France', environment.assetsUrl + '/map-layers/ign-sat.png', {code: 'fr'}),
      createDefaultLayer(injector, 'osm-fr', 'OSM France', 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', 20, '<a href="https://www.openstreetmap.fr/mentions-legales/">OSM France</a> Data &copy; <a href="http://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>', 2, true, 'image/png', environment.assetsUrl + '/map-layers/osmfr.png', undefined, {code: 'fr'}),
      createIgnLayer(injector, 'kartverket', 'Kartverket', 'https://cache.kartverket.no/v1/service', 'topo', 'webmercator', 'default', 'image/png', 18, 5, '&copy; Kartverket',  environment.assetsUrl + '/map-layers/kartverket.png', {code: 'no'}),
      //createIgnLayer(injector, 'ngi-be', 'NGI Belgium', 'https://', 'topo', '3857', 'default', 'image/png', 18, 5, '&copy; ngi.be', 'https://', {code: 'be'}),
      createDefaultLayer(injector, 'swiss-topo', 'Swiss Topo', 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg', 18, '&copy; <a href="https://www.swisstopo.admin.ch/" target="_blank">swisstopo</a>', 2, false, 'image/jpeg', environment.assetsUrl + '/map-layers/swiss-topo.png', {minZoom: 2, bounds: [[45.398181, 5.140242], [48.230651, 11.47757]]}, {code: 'ch'}),
      createDefaultLayer(injector, 'usgs-topo', 'USGS Topo', 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', 16, 'Tiles courtesy of the <a href="https://usgs.gov/" target="_blank">U.S. Geological Survey</a>', 2, false, 'image/jpeg', environment.assetsUrl + '/map-layers/usgs-topo.png', {}, {code: 'us'}),
      createDefaultLayer(injector, 'usgs-sat', 'USGS Satellite', 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}', 16, 'Tiles courtesy of the <a href="https://usgs.gov/" target="_blank">U.S. Geological Survey</a>', 2, false, 'image/jpeg', environment.assetsUrl + '/map-layers/usgs-sat.jpg', {}, {code: 'us'}),
      //createDefaultLayer('stadia-sat', 'Stadia Satellite', 'https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg', 20, '&copy; CNES, Distribution Airbus DS, © Airbus DS, © PlanetObserver (Contains Copernicus Data) | &copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors', 2, 'image/jpeg'),
      createDefaultLayer(injector, 'ngi-be-topo', 'NGI Topo', 'https://cartoweb.wmts.ngi.be/1.0.0/topo/default/3857/{z}/{y}/{x}.png', 17, '&copy; <a href="https://ngi.be/" target="_blank">ngi.be</a>', 2, false, 'image/png', environment.assetsUrl + '/map-layers/ngi-be-topo.png', {minZoom: 7}, {code: 'be'}),
      createIgnLayer(injector, 'lantmateriet', 'Lantmäteriet', 'https://minkarta.lantmateriet.se/map/topowebbcache', 'topowebb', '3857', 'default', 'image/png', 17, 5, '&copy; Lantmäteriet', environment.assetsUrl + '/map-layers/lantmateriet.png', {code: 'se'}),
    ];
    this.overlays = [
      createDefaultLayer(injector, 'wmth', 'Way Marked Trails Hiking', 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', 18, '&copy; <a href="http://waymarkedtrails.org/" target="_blank">Way Marked Trails</a>', 2, false, 'image/png', '', {zIndex: 2}),
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
            this.layers.push(createDefaultLayer(injector, 'tfo', 'Thunderforest Outdoors', 'https://{s}.tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=' + thunderforest.data['apikey'], 22, 'Maps &copy; <a href="https://www.thunderforest.com/">Thunderforest</a>, Data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>', 2, false, 'image/png', environment.assetsUrl + '/map-layers/tfo.png'));
          }
        } else if (index >= 0) {
          this.layers.splice(index, 1);
        }
        previousTfoKey = thunderforest?.data['apikey'];
      }
    );
    this.possibleLayers = [
      'osm', 'osmfr', 'otm', 'cyclosm', 'ign', 'ign-sat',
      'kartverket', 'swiss-topo', 'usgs-topo', 'usgs-sat', 'ngi-be-topo', 'lantmateriet',
      'tfo'
    ];
    const darkmap = localStorage.getItem(LOCALSTORAGE_KEY_DARKMAP);
    if (darkmap) this.toggleDarkMap();
  }

  public getDefaultLayer(): string {
    return 'osm';
  }

  public getBlob(layer: MapLayer, url: string): Observable<Blob> {
    if (layer.doNotUseNativeHttp) {
      return this.injector.get(HttpClient).get(url, {responseType: 'blob'});
    }
    return this.injector.get(HttpService).getBlob(url);
  }

  public get darkMapEnabled(): boolean { return this._darkMap; }

  public toggleDarkMap(): void {
    this._darkMap = !this._darkMap;
    if (this._darkMap) {
      localStorage.setItem(LOCALSTORAGE_KEY_DARKMAP, "true");
      globalThis.document.body.classList.add('dark-map');
    } else {
      localStorage.removeItem(LOCALSTORAGE_KEY_DARKMAP);
      globalThis.document.body.classList.remove('dark-map');
    }
    const maps = globalThis.document.getElementsByTagName('app-map');
    for (let i = 0; i < maps.length; ++i) {
      if (this._darkMap) {
        maps.item(i)!.classList.remove('light-theme');
        maps.item(i)!.classList.add('dark-theme');
      } else {
        maps.item(i)!.classList.remove('dark-theme');
        maps.item(i)!.classList.add('light-theme');
      }
    }
    const fullscreen = globalThis.document.getElementsByClassName('map-full-screen');
    for (let i = 0; i < fullscreen.length; ++i) {
      if (this._darkMap) {
        fullscreen.item(i)!.classList.remove('light-theme');
        fullscreen.item(i)!.classList.add('dark-theme');
      } else {
        fullscreen.item(i)!.classList.remove('dark-theme');
        fullscreen.item(i)!.classList.add('light-theme');
      }
    }
  }

  public applyDarkMap(element: HTMLElement): void {
    element.classList.add(this._darkMap ? 'dark-theme' : 'light-theme');
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
  tileMimeFormat: string,
  exampleUrl: string,
  additionalOptions: any = {},
  regional: RegionalSettings | undefined = undefined,
): MapLayer {
  const getTileUrl = (layer: L.TileLayer, coords: L.Coords, crs?: L.CRS) => {
    let zoom = coords.z;
    if (layer.options.zoomReverse && layer.options.maxZoom) zoom = layer.options.maxZoom - zoom;
    if (layer.options.zoomOffset) zoom += layer.options.zoomOffset;
    const data = {
        r: L.Browser.retina ? '@2x' : '',
        s: (layer as any)._getSubdomain(coords),
        x: coords.x,
        y: coords.y,
        z: zoom,
      } as any;
      if (crs && !crs.infinite && (layer as any)._globalTileRange) {
        const invertedY = (layer as any)._globalTileRange.max.y - coords.y;
        if (layer.options.tms) {
          data['y'] = invertedY;
        }
        data['-y'] = invertedY;
      }
      return L.Util.template((layer as any)._url, L.Util.extend(data, layer.options));
  };
  return {
    name,
    displayName,
    exampleUrl,
    regional,
    templateUrl: urlTemplate,
    tileMimeFormat,
    create: () => handleMapOffline(name, new L.TileLayer(urlTemplate, {
      maxZoom,
      attribution: copyright,
      id: name,
      ...additionalOptions
    }), getTileUrl, injector.get(NetworkService), injector.get(OfflineMapService)),
    getTileUrl,
    maxConcurrentRequests,
    doNotUseNativeHttp,
    tileSize: 256,
  };
}

function createIgnLayer( // NOSONAR
  injector: Injector,
  name: string,
  displayName: string,
  baseUrl: string,
  layerName: string,
  matrixSet: string,
  style: string,
  format: string,
  maxZoom: number,
  maxConcurrentRequests: number,
  attribution: string,
  exampleUrl: string,
  regional: RegionalSettings | undefined = undefined,
): MapLayer {
  const urlTemplate = baseUrl + '?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=' + layerName + '&STYLE=' + style + '&TILEMATRIXSET=' + matrixSet + '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=' + encodeURIComponent(format);
  const getTileUrl = (layer: L.TileLayer, coords: L.Coords, crs?: L.CRS) => {
    const data = {
      x: coords.x,
      y: coords.y,
      z: coords.z
    } as any;
    return L.Util.template(urlTemplate, data);
  };
  return {
    name,
    displayName,
    exampleUrl,
    regional,
    templateUrl: urlTemplate,
    tileMimeFormat: format,
    create: () => handleMapOffline(name, new L.TileLayer(urlTemplate, {
      maxZoom,
      attribution,
      id: name,
    }), getTileUrl, injector.get(NetworkService), injector.get(OfflineMapService)),
    getTileUrl,
    maxConcurrentRequests,
    doNotUseNativeHttp: false,
    tileSize: 256,
  };
}
