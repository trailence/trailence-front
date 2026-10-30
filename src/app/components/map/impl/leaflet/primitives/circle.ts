import { Circle, CircleOptions } from '@trailence/components/map/primitives/circle';
import { LeafletPrimitive } from './primitive';
import * as L from 'leaflet';
import { Leaflet } from '../leaflet';

export class LeafletCircle extends Circle<Leaflet> implements LeafletPrimitive {

  private marker?: L.CircleMarker;

  protected override addPrimitiveToMap(renderer: Leaflet): void {
    this.marker = L.circleMarker(this.position, {
      radius: this.options.radius, // TODO based on unit
      fill: this.options.fillColor !== undefined,
      fillColor: this.options.fillColor?.toString(),
      stroke: this.options.strokeColor !== undefined,
      color: this.options.strokeColor?.toString(),
      weight: this.options.strokeWidth ?? 1,
    });
    this.marker.addTo(renderer.getLeafletMap()!);
  }

  protected override removePrimitiveFromMap(): void {
    if (!this.marker) return;
    this.marker.remove();
    this.marker = undefined;
  }

  protected override applyNewPosition(): void {
    this.marker?.setLatLng(this.position);
  }

  protected override applyNewOptions(_: Leaflet, previous: CircleOptions): void {
    if (!this.marker) return;
    if (previous.radius !== this.options.radius) // TODO radiusUnit
      this.marker.setRadius(this.options.radius);
    this.marker.setStyle({
      fill: this.options.fillColor !== undefined,
      fillColor: this.options.fillColor?.toString(),
      stroke: this.options.strokeColor !== undefined,
      color: this.options.strokeColor?.toString(),
      weight: this.options.strokeWidth ?? 1,
    });
  }

  getLayer(): L.Layer | undefined {
    return this.marker;
  }

}
