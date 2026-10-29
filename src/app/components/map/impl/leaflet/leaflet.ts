import { AssetsService } from '@trailence/services/assets/assets.service';
import { MapRenderer, MapRendererType } from '../map-renderer';
import * as L from 'leaflet';
import { MapLayersService } from '@trailence/services/map/map-layers.service';
import { CircleOptions, Circle } from '../../primitives/circle';
import { LeafletCircle } from './primitives/circle';
import { MapPrimitive } from '../../map-element';
import { LeafletPrimitive } from './primitives/primitive';

export class Leaflet extends MapRenderer {

  private map?: L.Map;

  public override get type(): MapRendererType { return 'leaflet'; }

  public override async init(): Promise<any> {
    await this.injector.get(AssetsService).loadJs('leaflet-rotate.1.js');

    const mapLayersService = this.injector.get(MapLayersService);
    const layer = mapLayersService.layers.find(lay => lay.name === this.mapState.tilesName)
      ?? mapLayersService.layers.find(lay => lay.name === mapLayersService.getDefaultLayer())
      ?? mapLayersService.layers[0];
    const overlays = this.mapState.overlays.map(name => mapLayersService.overlays.find(o => o.name === name)).filter(o => !!o);

    this.map = L.map(this.containerId, {
      center: this.mapState.center,
      zoom: this.mapState.zoomInt,
      layers: [layer.create(), ...overlays.map(o => o.create())],
      zoomControl: false,
      worldCopyJump: true,
      //zoomSnap: 0.5,
      //zoomDelta: 0.5,
      rotate: true,
      bearing: this.mapState.bearing,
      touchGestures: true,
      touchRotate: true,
      touchRotateInertia: 15,
      rotateControl: false,
    } as any);
  }

  public override destroy(): void {
    this.map?.remove();
  }

  public override add(primitive: MapPrimitive): void {
    (primitive as LeafletPrimitive).addToLeaflet(this.map!);
  }

  public override remove(primitive: MapPrimitive): void {
    (primitive as LeafletPrimitive).removeFromLeaflet(this.map!);
  }

  public override bringToFront(primitive: MapPrimitive): void {
    const layer = (primitive as LeafletPrimitive).getLayer();
    if (!layer) return;
    const fct = (layer as any)['bringToFront'];
    if (typeof fct === 'function') (layer as any)['bringToFront']();
  }

  public override createCircle(id: string, options: CircleOptions): Circle {
    return new LeafletCircle(id, options);
  }

}
