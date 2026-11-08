import { Injector } from '@angular/core';
import { BaseLayerConfig, MapLayer, RETINA } from './map-layer';
import { EPSG3857_EARTH_RADIUS, projectEarthPointForZoom } from '@trailence/utils/latlng';

export interface DefaultLayerConfig extends BaseLayerConfig {
  urlTemplate: string;
  subdomains?: string;
}

export class DefaultMapLayer extends MapLayer {
  constructor(injector: Injector, config: DefaultLayerConfig) {
    super(injector, config);
    this.urlTemplate = config.urlTemplate;
    this.subdomains = config.subdomains ?? 'abc';
  }

  public readonly urlTemplate: string;
  public readonly subdomains: string;

  public override getUrl(x: number, y: number, z: number): string {
    if (this.zoomReverse) z = this.maxZoom - z;
    z += this.zoomOffset;
    const r = RETINA ? '@2x' : '';
    const s = this.subdomains[Math.abs(x + y) % this.subdomains.length];
    const min = projectEarthPointForZoom({lat: -EPSG3857_EARTH_RADIUS, lng: -EPSG3857_EARTH_RADIUS}, z);
    const max = projectEarthPointForZoom({lat: EPSG3857_EARTH_RADIUS, lng: EPSG3857_EARTH_RADIUS}, z);
    const maxY = Math.max(Math.floor(min.y / this.tileSize), Math.ceil(max.y / this.tileSize) - 1);
    const invertedY = maxY - y;
    /*
    if (layer.options.tms) {
      y = invertedY;
    }*/
    return this.urlTemplate
      .replaceAll('{r}', r)
      .replaceAll('{s}', s)
      .replaceAll('{x}', '' + x)
      .replaceAll('{y}', '' + y)
      .replaceAll('{z}', '' + z)
      .replaceAll('{-y}', '' + invertedY);
  }
}
