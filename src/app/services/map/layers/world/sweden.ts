import { Injector } from '@angular/core';
import { MapLayer } from '../map-layer';
import { Observable } from 'rxjs';
import { WmtsMapLayer } from '../wmts-map-layer';
import { WmsMapLayer } from '../wms-map-layer';

export function createSwedenLayers(injector: Injector): (MapLayer | {name: string, layer$: Observable<MapLayer | undefined>})[] {
  return [
    new WmtsMapLayer(injector, {
      name: 'lantmateriet',
      displayName: 'Lantmäteriet',
      type: 'raster',
      baseUrl: 'https://minkarta.lantmateriet.se/map/topowebbcache',
      layerName: 'topowebb',
      matrixSet: '3857',
      style: 'default',
      mimeFormat: 'image/png',
      maxZoom: 17,
      maxConcurrentRequests: 5,
      attribution: '&copy; Lantmäteriet',
      example: 'lantmateriet.png',
      regional: {code: 'se'},
      downloadType: 'angular',
    }),
    new WmsMapLayer(injector, {
      name: 'lantmateriet-sat',
      displayName: 'Lantmäteriet Flygbild',
      type: 'raster',
      baseUrl: 'https://minkarta.lantmateriet.se/map/ortofoto',
      layers: ['Ortofoto_0.5', 'Ortofoto_0.4', 'Ortofoto_0.25', 'Ortofoto_0.16'],
      serviceVersion: '1.1.1',
      uppercase: true,
      mimeFormat: 'image/png',
      maxZoom: 19,
      maxConcurrentRequests: 5,
      attribution: '&copy; Lantmäteriet',
      example: 'lantmateriet-sat.jpg',
      regional: { code: 'se' },
      downloadType: 'angular',
    }),
  ];
}
