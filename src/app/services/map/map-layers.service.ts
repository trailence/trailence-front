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
import { I18nService } from '../i18n/i18n.service';

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
      // global
      createDefaultLayer(injector, {
        name: 'osm',
        displayName: 'Open Street Map',
        urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        maxZoom: 19,
        copyright: '&copy; <a href="http://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
        maxConcurrentRequests: 2,
        doNotUseNativeHttp: true,
        mimeFormat: 'image/png',
        example: 'osm.png',
      }),
      createDefaultLayer(injector, {
        name: 'otm',
        displayName: 'Open Topo Map',
        urlTemplate: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        maxZoom: 17,
        copyright: '&copy; <a href="http://www.opentopomap.org" target="_blank">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank">CC-BY-SA</a>)',
        maxConcurrentRequests: 2,
        mimeFormat: 'image/png',
        example: 'otm.png',
      }),
      createDefaultLayer(injector, {
        name: 'cyclosm',
        displayName: 'CyclOSM',
        urlTemplate: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        maxZoom: 20,
        copyright: '<a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases" target="_blank">CyclOSM</a> Map data &copy; <a href="http://www.openstreetmap.org" target="_blank">OpenStreetMap</a> contributors',
        maxConcurrentRequests: 2,
        doNotUseNativeHttp: true,
        mimeFormat: 'image/png',
        example: 'cyclosm.png',
      }),
      // belgium
      createDefaultLayer(injector, {
        name: 'ngi-be-topo',
        displayName: 'NGI Belgium Topo',
        urlTemplate: 'https://cartoweb.wmts.ngi.be/1.0.0/topo/default/3857/{z}/{y}/{x}.png',
        maxZoom: 17,
        copyright: '&copy; <a href="https://ngi.be/" target="_blank">ngi.be</a>',
        maxConcurrentRequests: 2,
        mimeFormat: 'image/png',
        example: 'ngi-be-topo.png',
        additionalOptions: {minZoom: 7},
        regional: {code: 'be'},
      }),
      createWmsLayer(injector, {
        name: 'ngi-be-sat',
        displayName: 'NGI Belgium Satellite',
        baseUrl: 'https://wms.ngi.be/inspire/ortho/service',
        layers: 'orthoimage_coverage',
        serviceVersion: '1.3.0',
        uppercase: true,
        mimeFormat: 'image/jpeg',
        maxZoom: 20,
        maxConcurrentRequests: 5,
        copyright: '&copy; <a href="https://ngi.be/" target="_blank">ngi.be</a>',
        example: 'ngi-be-sat.jpg',
        regional: { code: 'be' },
      }),
      // spain
      createWmtsLayer(injector, {
        name: 'ign-es',
        displayName: 'IGN Spain',
        baseUrl: 'https://www.ign.es/wmts/mapa-raster',
        layerName: 'MTN',
        matrixSet: 'GoogleMapsCompatible',
        style: 'default',
        mimeFormat: 'image/png',
        maxZoom: 20,
        maxConcurrentRequests: 5,
        copyright: '&copy; Instituto Geográfico Nacional',
        example: 'ign-es.png',
        regional: {code: 'es'},
      }),
      createDefaultLayer(injector, {
        name: 'ign-es-sat',
        displayName: 'IGN Spain Satellite',
        urlTemplate: 'https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma/{z}/{x}/{-y}.jpeg',
        maxZoom: 19,
        copyright: '&copy; Instituto Geográfico Nacional',
        maxConcurrentRequests: 5,
        mimeFormat: 'image/jpeg',
        example: 'ign-es-sat.jpg',
        regional: {code: 'es'},
      }),
      // finland
      /*
      createDefaultLayer(injector, {
        name: 'mml-fi',
        displayName: 'Maanmittauslaitos',
        urlTemplate: 'https://karttamoottori.maanmittauslaitos.fi/maasto/wmts/1.0.0/maastokartta/default/ETRS-TM35FIN/{z}/{y}/{x}.png',
        maxZoom: 25,
        copyright: '&copy; Maanmittauslaitos',
        maxConcurrentRequests: 5,
        mimeFormat: 'image/png',
        example: '',
        regional: { code: 'fi' },
        additionalOptions: { zoomOffset: -3,  }
      }),*/
      // france
      createWmtsLayer(injector, {
        name: 'ign',
        displayName: 'IGN France',
        baseUrl: 'https://data.geopf.fr/wmts',
        layerName: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2',
        matrixSet: 'PM',
        style: 'normal',
        mimeFormat: 'image/png',
        maxZoom: 19,
        maxConcurrentRequests: 5,
        copyright: '&copy; IGN France',
        example: 'ign.png',
        regional: {code: 'fr'},
      }),
      createWmtsLayer(injector, {
        name: 'ign-sat',
        displayName: 'IGN France Satellite',
        baseUrl: 'https://data.geopf.fr/wmts',
        layerName: 'ORTHOIMAGERY.ORTHOPHOTOS',
        matrixSet: 'PM',
        style: 'normal',
        mimeFormat: 'image/jpeg',
        maxZoom: 19,
        maxConcurrentRequests: 5,
        copyright: '&copy; IGN France',
        example: 'ign-sat.png',
        regional: {code: 'fr'},
      }),
      createDefaultLayer(injector, {
        name: 'osm-fr',
        displayName: 'OSM France',
        urlTemplate: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
        maxZoom: 20,
        copyright: '<a href="https://www.openstreetmap.fr/mentions-legales/">OSM France</a> Data &copy; <a href="http://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
        maxConcurrentRequests: 2,
        doNotUseNativeHttp: true,
        mimeFormat: 'image/png',
        example: 'osmfr.png',
        regional: {code: 'fr'},
      }),
      // norway
      createWmtsLayer(injector, {
        name: 'kartverket',
        displayName: 'Kartverket',
        baseUrl: 'https://cache.kartverket.no/v1/service',
        layerName: 'topo',
        matrixSet: 'webmercator',
        style: 'default',
        mimeFormat: 'image/png',
        maxZoom: 18,
        maxConcurrentRequests: 5,
        copyright: '&copy; Kartverket',
        example: 'kartverket.png',
        regional: {code: 'no'},
      }),
      // sweden
      createWmtsLayer(injector, {
        name: 'lantmateriet',
        displayName: 'Lantmäteriet',
        baseUrl: 'https://minkarta.lantmateriet.se/map/topowebbcache',
        layerName: 'topowebb',
        matrixSet: '3857',
        style: 'default',
        mimeFormat: 'image/png',
        maxZoom: 17,
        maxConcurrentRequests: 5,
        copyright: '&copy; Lantmäteriet',
        example: 'lantmateriet.png',
        regional: {code: 'se'},
      }),
      createWmsLayer(injector, {
        name: 'lantmateriet-sat',
        displayName: 'Lantmäteriet Flygbild',
        baseUrl: 'https://minkarta.lantmateriet.se/map/ortofoto',
        layers: 'Ortofoto_0.5,Ortofoto_0.4,Ortofoto_0.25,Ortofoto_0.16',
        serviceVersion: '1.1.1',
        uppercase: true,
        mimeFormat: 'image/png',
        maxZoom: 19,
        maxConcurrentRequests: 5,
        copyright: '&copy; Lantmäteriet',
        example: 'lantmateriet-sat.jpg',
        regional: { code: 'se' },
      }),
      // swiss
      createDefaultLayer(injector, {
        name: 'swiss-topo',
        displayName: 'Swiss Topo',
        urlTemplate: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
        maxZoom: 18,
        copyright: '&copy; <a href="https://www.swisstopo.admin.ch/" target="_blank">swisstopo</a>',
        maxConcurrentRequests: 2,
        mimeFormat: 'image/jpeg',
        example: 'swiss-topo.png',
        additionalOptions: {minZoom: 2, bounds: [[45.398181, 5.140242], [48.230651, 11.47757]]},
        regional: {code: 'ch'},
      }),
      // us
      createDefaultLayer(injector, {
        name: 'usgs-topo',
        displayName: 'USGS Topo',
        urlTemplate: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 16,
        copyright: 'Tiles courtesy of the <a href="https://usgs.gov/" target="_blank">U.S. Geological Survey</a>',
        maxConcurrentRequests: 2,
        mimeFormat: 'image/jpeg',
        example: 'usgs-topo.png',
        regional: {code: 'us'},
      }),
      createDefaultLayer(injector, {
        name: 'usgs-sat',
        displayName: 'USGS Satellite',
        urlTemplate: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 16,
        copyright: 'Tiles courtesy of the <a href="https://usgs.gov/" target="_blank">U.S. Geological Survey</a>',
        maxConcurrentRequests: 2,
        mimeFormat: 'image/jpeg',
        example: 'usgs-sat.jpg',
        regional: {code: 'us'},
      }),

      //createDefaultLayer('osmch', 'Open Street Map Swiss', 'https://tile.osm.ch/osm-swiss-style/{z}/{x}/{y}.png', 19, '&copy; <a href="https://sosm.ch/" target="_blank">Swiss OpenStreetMap Association</a>', 2, false, 'image/png'),
      //createIgnLayer(injector, 'ngi-be', 'NGI Belgium', 'https://', 'topo', '3857', 'default', 'image/png', 18, 5, '&copy; ngi.be', 'https://', {code: 'be'}),
      //createDefaultLayer('stadia-sat', 'Stadia Satellite', 'https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg', 20, '&copy; CNES, Distribution Airbus DS, © Airbus DS, © PlanetObserver (Contains Copernicus Data) | &copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors', 2, 'image/jpeg'),
    ];
    this.overlays = [
      createDefaultLayer(injector, {
        name: 'wmth',
        displayName: 'Way Marked Trails Hiking',
        urlTemplate: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
        maxZoom: 18,
        copyright: '&copy; <a href="http://waymarkedtrails.org/" target="_blank">Way Marked Trails</a>',
        maxConcurrentRequests: 2,
        mimeFormat: 'image/png',
        example: '',
        additionalOptions: {zIndex: 2},
      }),
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
            this.layers.push(createDefaultLayer(injector, {
              name: 'tfo',
              displayName: 'Thunderforest Outdoors',
              urlTemplate: 'https://{s}.tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=' + thunderforest.data['apikey'],
              maxZoom: 22,
              copyright: 'Maps &copy; <a href="https://www.thunderforest.com/">Thunderforest</a>, Data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
              maxConcurrentRequests: 2,
              mimeFormat: 'image/png',
              example: 'tfo.png',
            }));
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

interface BaseLayerConfig {
  name: string;
  displayName: string;
  maxZoom: number,
  copyright: string,
  maxConcurrentRequests: number,
  mimeFormat: string,
  example: string,
  regional?: RegionalSettings,
  additionalOptions?: Partial<L.TileLayerOptions>,
}

interface DefaultLayerConfig extends BaseLayerConfig {
  urlTemplate: string,
  doNotUseNativeHttp?: boolean,
}

function createDefaultLayer( // NOSONAR
  injector: Injector,
  config: DefaultLayerConfig,
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
    name: config.name,
    displayName: config.displayName,
    exampleUrl: environment.assetsUrl + '/map-layers/' + config.example,
    regional: config.regional,
    templateUrl: config.urlTemplate,
    tileMimeFormat: config.mimeFormat,
    create: () => handleMapOffline(config.name, config.displayName, new L.TileLayer(config.urlTemplate, {
      maxZoom: config.maxZoom,
      attribution: config.copyright,
      id: config.name,
      ...(config.additionalOptions ?? {})
    }), getTileUrl, injector.get(NetworkService), injector.get(OfflineMapService), injector.get(I18nService)),
    getTileUrl,
    maxConcurrentRequests: config.maxConcurrentRequests,
    doNotUseNativeHttp: config.doNotUseNativeHttp ?? false,
    tileSize: 256,
  };
}

interface WmtsTileLayerConfig extends BaseLayerConfig {
  baseUrl: string;
  layerName: string;
  matrixSet: string;
  style: string;
}

function createWmtsLayer(injector: Injector, config: WmtsTileLayerConfig): MapLayer {
  const urlTemplate = config.baseUrl + '?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=' + config.layerName + '&STYLE=' + config.style + '&TILEMATRIXSET=' + config.matrixSet + '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=' + encodeURIComponent(config.mimeFormat);
  return _createIgnLayer(injector, config, urlTemplate);
}


function _createIgnLayer( // NOSONAR
  injector: Injector,
  baseConfig: BaseLayerConfig,
  urlTemplate: string,
): MapLayer {
  const getTileUrl = (layer: L.TileLayer, coords: L.Coords, crs?: L.CRS) => {
    const data = {
      x: coords.x,
      y: coords.y,
      z: coords.z
    } as any;
    return L.Util.template(urlTemplate, data);
  };
  return {
    name: baseConfig.name,
    displayName: baseConfig.displayName,
    exampleUrl: environment.assetsUrl + '/map-layers/' + baseConfig.example,
    regional: baseConfig.regional,
    templateUrl: urlTemplate,
    tileMimeFormat: baseConfig.mimeFormat,
    create: () => handleMapOffline(baseConfig.name, baseConfig.displayName, new L.TileLayer(urlTemplate, {
      maxZoom: baseConfig.maxZoom,
      attribution: baseConfig.copyright,
      id: baseConfig.name,
      ...(baseConfig.additionalOptions ?? {}),
    }), getTileUrl, injector.get(NetworkService), injector.get(OfflineMapService), injector.get(I18nService)),
    getTileUrl,
    maxConcurrentRequests: baseConfig.maxConcurrentRequests,
    doNotUseNativeHttp: false,
    tileSize: 256,
  };
}


interface WmsMapLayerConfig extends BaseLayerConfig {
  baseUrl: string;
  serviceVersion: string;
  layers?: string;
  styles?: string;
  crs?: L.CRS;
  uppercase?: boolean;
}

function createWmsLayer(injector: Injector, config: WmsMapLayerConfig): MapLayer {
  const getTileUrl = (layer: L.TileLayer, coords: L.Coords, mapCrs?: L.CRS) => {
    const l = layer as L.TileLayer.WMS;
    const la = layer as any;
    const tileBounds = la._tileCoordsToNwSe(coords);
    const crs = mapCrs ?? la._crs;
    const bounds = L.bounds(crs.project(tileBounds[0]), crs.project(tileBounds[1]));
    const min = bounds.min!;
    const max = bounds.max!;
    const bbox = (la._wmsVersion >= 1.3 && crs === L.CRS.EPSG4326 ? [min.y, min.x, max.y, max.x] :
            [min.x, min.y, max.x, max.y]).join(',');
    const url = L.TileLayer.prototype.getTileUrl.call(layer, coords);
    return url + L.Util.getParamString(l.wmsParams, url, l.options.uppercase) + (l.options.uppercase ? '&BBOX=' : '&bbox=') + bbox;
  };
  return {
    name: config.name,
    displayName: config.displayName,
    exampleUrl: environment.assetsUrl + '/map-layers/' + config.example,
    regional: config.regional,
    templateUrl: '',
    tileMimeFormat: config.mimeFormat,
    create: () => handleMapOffline(config.name, config.displayName, new L.TileLayer.WMS(config.baseUrl, {
      layers: config.layers ?? '',
      styles: config.styles ?? '',
      format: config.mimeFormat,
      transparent: true,
      version: config.serviceVersion,
      crs: config.crs,
      uppercase: config.uppercase ?? false,
      maxZoom: config.maxZoom,
      attribution: config.copyright,
      id: config.name,
      ...(config.additionalOptions ?? {}),
    }), getTileUrl, injector.get(NetworkService), injector.get(OfflineMapService), injector.get(I18nService)),
    getTileUrl,
    maxConcurrentRequests: config.maxConcurrentRequests,
    doNotUseNativeHttp: false,
    tileSize: 256,
  };
}
