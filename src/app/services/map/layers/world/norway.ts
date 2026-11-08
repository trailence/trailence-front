import { Injector } from '@angular/core';
import { MapLayer } from '../map-layer';
import { Observable } from 'rxjs';
import { WmtsMapLayer } from '../wmts-map-layer';

export function createNorwayLayers(injector: Injector): (MapLayer | {name: string, layer$: Observable<MapLayer | undefined>})[] {
  return [
    new WmtsMapLayer(injector, {
      name: 'kartverket',
      displayName: 'Kartverket',
      type: 'raster',
      baseUrl: 'https://cache.kartverket.no/v1/service',
      layerName: 'topo',
      matrixSet: 'webmercator',
      style: 'default',
      mimeFormat: 'image/png',
      maxZoom: 18,
      maxConcurrentRequests: 5,
      attribution: '&copy; Kartverket',
      example: 'kartverket.png',
      regional: {code: 'no'},
      downloadType: 'angular',
    }),
  ];
}
