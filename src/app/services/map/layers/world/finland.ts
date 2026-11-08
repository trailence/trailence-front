import { Injector } from '@angular/core';
import { MapLayer } from '../map-layer';
import { Observable } from 'rxjs';

export function createFinlandLayers(injector: Injector): (MapLayer | {name: string, layer$: Observable<MapLayer | undefined>})[] {
  return [
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
  ];
}
