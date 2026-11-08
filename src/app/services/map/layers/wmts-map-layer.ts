import { Injector } from '@angular/core';
import { DefaultMapLayer } from './default-map-layer';
import { BaseLayerConfig } from './map-layer';

export interface WmtsTileLayerConfig extends BaseLayerConfig {
  baseUrl: string;
  layerName: string;
  matrixSet: string;
  style: string;
}

export class WmtsMapLayer extends DefaultMapLayer {
  constructor(injector: Injector, config: WmtsTileLayerConfig) {
    super(injector, {
      ...config,
      urlTemplate: config.baseUrl + '?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=' + config.layerName + '&STYLE=' + config.style + '&TILEMATRIXSET=' + config.matrixSet + '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=' + encodeURIComponent(config.mimeFormat),
    });
  }
}
