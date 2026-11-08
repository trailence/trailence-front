import { Injector } from '@angular/core';
import { MapLayer } from '../map-layer';
import { Observable } from 'rxjs';
import { WmtsMapLayer } from '../wmts-map-layer';
import { DefaultMapLayer } from '../default-map-layer';

export function createFranceLayers(injector: Injector): (MapLayer | {name: string, layer$: Observable<MapLayer | undefined>})[] {
  return [
    new WmtsMapLayer(injector, {
      name: 'ign',
      displayName: 'IGN France',
      type: 'raster',
      baseUrl: 'https://data.geopf.fr/wmts',
      layerName: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2',
      matrixSet: 'PM',
      style: 'normal',
      mimeFormat: 'image/png',
      maxZoom: 19,
      maxConcurrentRequests: 5,
      attribution: '&copy; IGN France',
      example: 'ign.png',
      regional: {code: 'fr'},
      downloadType: 'angular',
    }),
    new WmtsMapLayer(injector, {
      name: 'ign-sat',
      displayName: 'IGN France Satellite',
      type: 'raster',
      baseUrl: 'https://data.geopf.fr/wmts',
      layerName: 'ORTHOIMAGERY.ORTHOPHOTOS',
      matrixSet: 'PM',
      style: 'normal',
      mimeFormat: 'image/jpeg',
      maxZoom: 19,
      maxConcurrentRequests: 5,
      attribution: '&copy; IGN France',
      example: 'ign-sat.png',
      regional: {code: 'fr'},
      downloadType: 'angular',
    }),
    new DefaultMapLayer(injector, {
      name: 'osm-fr',
      displayName: 'OSM France',
      type: 'raster',
      urlTemplate: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
      maxZoom: 20,
      attribution: '<a href="https://www.openstreetmap.fr/mentions-legales/">OSM France</a> Data &copy; <a href="http://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      maxConcurrentRequests: 2,
      downloadType: 'angular',
      mimeFormat: 'image/png',
      example: 'osmfr.png',
      regional: {code: 'fr'},
    }),
  ];
}
