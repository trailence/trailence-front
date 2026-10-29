import { MapLibreMap } from 'maplibre-gl';
import { MapRenderer, MapRendererType } from '../map-renderer';
import { CircleOptions, Circle } from '../../primitives/circle';
import { MapLibreCircle } from './primitives/circle';
import { MapPrimitive } from '../../map-element';
import { MapLibrePrimitive } from './primitives/primitive';

export class MapLibre extends MapRenderer {

  private map?: MapLibreMap;

  public override get type(): MapRendererType { return 'maplibre'; }

  public override async init() {
    return new Promise(resolve => {
      this.map = new MapLibreMap({
        container: this.containerId,
        center: this.mapState.center,
        zoom: this.mapState.zoomInt,
        bearing: this.mapState.bearing,
      });
      this.map.on('style.load', () => resolve(true));
    });
  }

  public override destroy(): void {
    this.map?.remove();
  }

  public override add(primitive: MapPrimitive): void {
    (primitive as MapLibrePrimitive).addToMapLibre(this.map!, this.mapState);
  }

  public override remove(primitive: MapPrimitive): void {
    (primitive as MapLibrePrimitive).removeFromMapLibre(this.map!, this.mapState);
  }

  public override bringToFront(primitive: MapPrimitive): void {
    (primitive as MapLibrePrimitive).getLayersIds().forEach(id => this.map!.moveLayer(id));
  }

  public override createCircle(id: string, options: CircleOptions): Circle {
    return new MapLibreCircle(id, options);
  }

}
