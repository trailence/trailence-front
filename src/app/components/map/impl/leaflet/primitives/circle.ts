import { Circle, CircleOptions } from '@trailence/components/map/primitives/circle';
import { LeafletPrimitive } from './primitive';
import * as L from 'leaflet';
import { Leaflet } from '../leaflet';
import { LeafletPrimitiveEvents } from './events';

export class LeafletCircle extends Circle<Leaflet> implements LeafletPrimitive {

  private marker?: L.CircleMarker;
  public override readonly events: LeafletPrimitiveEvents<CircleOptions, LeafletCircle> = new LeafletPrimitiveEvents<CircleOptions, LeafletCircle>(
    this,
    () => this.marker?.options?.interactive === true,
    () => this.marker?.setStyle(this.getLeafletOptions()),
  );

  protected override addPrimitiveToMap(renderer: Leaflet): void {
    this.marker = L.circleMarker(this.position, this.getLeafletOptions());
    this.marker.addTo(renderer.getLeafletMap()!);
  }

  private getLeafletOptions(): L.CircleMarkerOptions {
    return {
      radius: this.options.radius, // TODO based on unit
      fill: this.options.fillColor !== undefined,
      fillColor: this.options.fillColor?.toString(),
      stroke: this.options.strokeColor !== undefined,
      color: this.options.strokeColor?.toString(),
      weight: this.options.strokeWidth ?? 1,
      interactive: this.events.isInteractive(),
    };
  }

  protected override removePrimitiveFromMap(): void {
    if (!this.marker) return;
    this.marker.remove();
    this.marker = undefined;
    this.events.removed();
  }

  protected override applyNewPosition(): void {
    this.marker?.setLatLng(this.position);
  }

  protected override applyNewOptions(_: Leaflet, previous: CircleOptions): void {
    if (!this.marker) return;
    if (previous.radius !== this.options.radius) // TODO radiusUnit
      this.marker.setRadius(this.options.radius);
    this.marker.setStyle(this.getLeafletOptions());
  }

  getLayer(): L.Layer | undefined {
    return this.marker;
  }

}
