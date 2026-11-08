import { Injector } from '@angular/core';
import { MapLayer } from '../map-layer';
import { Observable } from 'rxjs';
import { DefaultMapLayer } from '../default-map-layer';
import { WmsMapLayer } from '../wms-map-layer';

export function createBelgiumLayers(injector: Injector): (MapLayer | {name: string, layer$: Observable<MapLayer | undefined>})[] {
  return [
    new DefaultMapLayer(injector, {
      name: 'ngi-be-topo',
      displayName: 'NGI Belgium Topo',
      type: 'raster',
      urlTemplate: 'https://cartoweb.wmts.ngi.be/1.0.0/topo/default/3857/{z}/{y}/{x}.png',
      minZoom: 7,
      maxZoom: 17,
      attribution: '&copy; <a href="https://ngi.be/" target="_blank">ngi.be</a>',
      maxConcurrentRequests: 2,
      mimeFormat: 'image/png',
      example: 'ngi-be-topo.png',
      regional: {code: 'be'},
      downloadType: 'angular',
    }),
    new WmsMapLayer(injector, {
      name: 'ngi-be-sat',
      displayName: 'NGI Belgium Satellite',
      type: 'raster',
      baseUrl: 'https://wms.ngi.be/inspire/ortho/service',
      layers: ['orthoimage_coverage'],
      serviceVersion: '1.3.0',
      uppercase: true,
      mimeFormat: 'image/jpeg',
      maxZoom: 20,
      maxConcurrentRequests: 5,
      attribution: '&copy; <a href="https://ngi.be/" target="_blank">ngi.be</a>',
      example: 'ngi-be-sat.jpg',
      regional: { code: 'be' },
      downloadType: 'angular',
    }),
  ];
}
