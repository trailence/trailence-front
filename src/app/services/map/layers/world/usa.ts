import { Injector } from '@angular/core';
import { MapLayer } from '../map-layer';
import { Observable } from 'rxjs';
import { DefaultMapLayer } from '../default-map-layer';

export function createUsaLayers(injector: Injector): (MapLayer | {name: string, layer$: Observable<MapLayer | undefined>})[] {
  return [
    new DefaultMapLayer(injector, {
      name: 'usgs-topo',
      displayName: 'USGS Topo',
      type: 'raster',
      urlTemplate: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
      maxZoom: 16,
      attribution: 'Tiles courtesy of the <a href="https://usgs.gov/" target="_blank">U.S. Geological Survey</a>',
      maxConcurrentRequests: 2,
      mimeFormat: 'image/jpeg',
      example: 'usgs-topo.png',
      regional: {code: 'us'},
      downloadType: 'angular',
    }),
    new DefaultMapLayer(injector, {
      name: 'usgs-sat',
      displayName: 'USGS Satellite',
      type: 'raster',
      urlTemplate: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
      maxZoom: 16,
      attribution: 'Tiles courtesy of the <a href="https://usgs.gov/" target="_blank">U.S. Geological Survey</a>',
      maxConcurrentRequests: 2,
      mimeFormat: 'image/jpeg',
      example: 'usgs-sat.jpg',
      regional: {code: 'us'},
      downloadType: 'angular',
    }),
  ];
}
