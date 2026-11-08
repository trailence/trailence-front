import { Injector } from '@angular/core';
import { MapLayer } from '../map-layer';
import { Observable } from 'rxjs';
import { DefaultMapLayer } from '../default-map-layer';

export function createSwissLayers(injector: Injector): (MapLayer | {name: string, layer$: Observable<MapLayer | undefined>})[] {
  return [
    new DefaultMapLayer(injector, {
      name: 'swiss-topo',
      displayName: 'Swiss Topo',
      type: 'raster',
      urlTemplate: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
      minZoom: 2,
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.swisstopo.admin.ch/" target="_blank">swisstopo</a>',
      maxConcurrentRequests: 2,
      mimeFormat: 'image/jpeg',
      example: 'swiss-topo.png',
      bounds: {minlat: 45.398181, minlng: 5.140242, maxlat: 48.230651, maxlng: 11.47757},
      regional: {code: 'ch'},
      downloadType: 'angular',
    }),
  ];
}
