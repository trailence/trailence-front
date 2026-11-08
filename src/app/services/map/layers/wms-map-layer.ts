import { Injector } from '@angular/core';
import { BaseLayerConfig, MapLayer } from './map-layer';
import { projectEarthPoint, unprojectToEarthPointForZoom } from '@trailence/utils/latlng';

export interface WmsMapLayerConfig extends BaseLayerConfig {
  baseUrl: string;
  serviceVersion: string;
  layers?: string[];
  styles?: string[];
  uppercase?: boolean;
}

export class WmsMapLayer extends MapLayer {
  constructor(injector: Injector, config: WmsMapLayerConfig) {
    super(injector, config);
    this.baseUrl = config.baseUrl;
    this.serviceVersion = config.serviceVersion;
    this.layers = config.layers ?? [];
    this.styles = config.styles ?? [];
    this.uppercase = config.uppercase ?? false;
  }

  public readonly baseUrl: string;
  public readonly serviceVersion: string;
  public readonly layers: string[];
  public readonly styles: string[];
  public readonly uppercase: boolean;

  public override getUrl(x: number, y: number, z: number): string {
    const nwPoint = {x: x * this.tileSize, y: y * this.tileSize};
    const sePoint = {x: (x + 1) * this.tileSize, y: (y + 1) * this.tileSize};;
    const nw = unprojectToEarthPointForZoom(nwPoint, z);
    const se = unprojectToEarthPointForZoom(sePoint, z);
    const min = projectEarthPoint(nw);
    const max = projectEarthPoint(se);
    const bbox = [min.x, min.y, max.x, max.y].join(',');

    return this.baseUrl +
      '?' + this.toCase('service') + '=WMS' +
      '&' + this.toCase('request') + '=GetMap' +
      '&' + this.toCase('layers') + '=' + this.layers.join(',') +
      '&' + this.toCase('styles') + '=' + this.styles.join(',') +
      '&' + this.toCase('format') + '=' + encodeURIComponent(this.mimeFormat) +
      '&' + this.toCase('transparent') + '=true' +
      '&' + this.toCase('version') + '=' + this.serviceVersion +
      '&' + this.toCase('width') + '=' + this.tileSize +
      '&' + this.toCase('height') + '=' + this.tileSize +
      '&' + this.toCase('bbox') + '=' + bbox;
  }

  private toCase(name: string): string {
    if (this.uppercase) return name.toUpperCase();
    return name;
  }
}
