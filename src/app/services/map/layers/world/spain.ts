import { Injector } from '@angular/core';
import { MapLayer } from '../map-layer';
import { Observable } from 'rxjs';
import { WmtsMapLayer } from '../wmts-map-layer';
import { DefaultMapLayer } from '../default-map-layer';

export function createSpainLayers(injector: Injector): (MapLayer | {name: string, layer$: Observable<MapLayer | undefined>})[] {
  return [
    new WmtsMapLayer(injector, {
      name: 'ign-es',
      displayName: 'IGN Spain',
      type: 'raster',
      baseUrl: 'https://www.ign.es/wmts/mapa-raster',
      layerName: 'MTN',
      matrixSet: 'GoogleMapsCompatible',
      style: 'default',
      mimeFormat: 'image/png',
      maxZoom: 20,
      maxConcurrentRequests: 5,
      attribution: '&copy; Instituto Geográfico Nacional',
      example: 'ign-es.png',
      regional: {code: 'es'},
      downloadType: 'angular',
    }),
    new DefaultMapLayer(injector, {
      name: 'ign-es-sat',
      displayName: 'IGN Spain Satellite',
      type: 'raster',
      urlTemplate: 'https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma/{z}/{x}/{-y}.jpeg',
      maxZoom: 19,
      attribution: '&copy; Instituto Geográfico Nacional',
      maxConcurrentRequests: 5,
      mimeFormat: 'image/jpeg',
      example: 'ign-es-sat.jpg',
      regional: {code: 'es'},
    }),
  ];
}
