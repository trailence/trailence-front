import { Injector } from '@angular/core';
import { MapLayer } from '../map-layer';
import { EMPTY, Observable, of, switchMap } from 'rxjs';
import { DefaultMapLayer } from '../default-map-layer';
import { ExtensionsService } from '@trailence/services/database/extensions.service';

export function createWorldLayers(injector: Injector): (MapLayer | {name: string, layer$: Observable<MapLayer | undefined>})[] {
  return [
    new DefaultMapLayer(injector, {
      name: 'osm',
      displayName: 'Open Street Map',
      type: 'raster',
      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxZoom: 19,
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      maxConcurrentRequests: 2,
      downloadType: 'angular',
      mimeFormat: 'image/png',
      example: 'osm.png',
    }),
    new DefaultMapLayer(injector, {
      name: 'otm',
      displayName: 'Open Topo Map',
      type: 'raster',
      urlTemplate: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      maxZoom: 17,
      attribution: '&copy; <a href="http://www.opentopomap.org" target="_blank">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank">CC-BY-SA</a>)',
      maxConcurrentRequests: 2,
      mimeFormat: 'image/png',
      example: 'otm.png',
      downloadType: 'angular',
    }),
    new DefaultMapLayer(injector, {
      name: 'cyclosm',
      displayName: 'CyclOSM',
      type: 'raster',
      urlTemplate: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
      maxZoom: 20,
      attribution: '<a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases" target="_blank">CyclOSM</a> Map data &copy; <a href="http://www.openstreetmap.org" target="_blank">OpenStreetMap</a> contributors',
      maxConcurrentRequests: 2,
      downloadType: 'angular',
      mimeFormat: 'image/png',
      example: 'cyclosm.png',
    }),
    new DefaultMapLayer(injector, {
      name: 'wmth',
      displayName: 'Way Marked Trails Hiking',
      type: 'raster-overlay',
      urlTemplate: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
      maxZoom: 18,
      attribution: '&copy; <a href="http://waymarkedtrails.org/" target="_blank">Way Marked Trails</a>',
      maxConcurrentRequests: 2,
      mimeFormat: 'image/png',
      example: '',
    }),
    {
      name: 'tfo',
      layer$: thunderForestLayer(injector),
    },
    new DefaultMapLayer(injector, {
      name: 'mapterhorn',
      displayName: 'Mapterhorn',
      type: 'raster-dem',
      attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>',
      urlTemplate: 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp',
      maxZoom: 17,
      tileSize: 512,
      example:'',
      mimeFormat: 'image/webp',
      maxConcurrentRequests: 5,
      bounds: {minlat: -85.0511287, minlng: -180, maxlat: 85.0511287, maxlng: 180},
      demEncoding: 'terrarium',
    }),
  ]
}

function thunderForestLayer(injector: Injector): Observable<MapLayer | undefined> {
  let previousKey: string | undefined = undefined;
  return injector.get(ExtensionsService).getExtensions$().pipe(
    switchMap(extensions => {
      const thunderforest = extensions.find(e => e.extension === 'thunderforest.com');
      const newKey = thunderforest?.data['apikey'];
      if (newKey) {
        if (newKey === previousKey) return EMPTY; // no change
        previousKey = newKey;
        return of(new DefaultMapLayer(injector, {
          name: 'tfo',
          displayName: 'Thunderforest Outdoors',
          type: 'raster',
          urlTemplate: 'https://{s}.tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=' + thunderforest.data['apikey'],
          maxZoom: 22,
          attribution: 'Maps &copy; <a href="https://www.thunderforest.com/">Thunderforest</a>, Data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
          maxConcurrentRequests: 2,
          mimeFormat: 'image/png',
          example: 'tfo.png',
        }));
      } else if (previousKey !== undefined) {
        previousKey = undefined;
        return of(undefined); // removed
      }
      return EMPTY; // no change
    })
  );
}
