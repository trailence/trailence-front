import { Circle, CircleOptions } from '@trailence/components/map/primitives/circle';
import { LeafletPrimitive } from './primitive';
import * as L from 'leaflet';

export class LeafletCircle extends Circle implements LeafletPrimitive {

  private leaflet?: L.Map;
  private marker?: L.CircleMarker;

  addToLeaflet(leafet: L.Map): void {
    this.leaflet = leafet;
    this.marker = L.circleMarker(this.options.position, {
      radius: this.options.radius, // TODO based on unit
      fill: this.options.fillColor !== undefined,
      fillColor: this.options.fillColor?.toString(),
      stroke: this.options.strokeColor !== undefined,
      color: this.options.strokeColor?.toString(),
      weight: this.options.strokeWidth ?? 1,
    });
    this.marker.addTo(leafet);
  }

  removeFromLeaflet(leafet: L.Map): void {
    if (!this.marker) return;
    this.marker.remove();
    this.marker = undefined;
  }

  public override setOptions(options: CircleOptions): void {
    const previous = this.options;
    this.options = {...options};
    if (!this.marker) return;
    if (previous.position.lat !== options.position.lat || previous.position.lng !== options.position.lng)
      this.marker.setLatLng(options.position);
    if (previous.radius !== options.radius) // TODO radiusUnit
      this.marker.setRadius(options.radius);
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
