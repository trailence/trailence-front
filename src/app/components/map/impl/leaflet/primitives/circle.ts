import { Circle, CircleOptions } from '@trailence/components/map/primitives/circle';
import { LeafletPrimitive } from './primitive';
import * as L from 'leaflet';
import { Leaflet } from '../leaflet';
import { LeafletPrimitiveEvents } from './events';
import { EarthPoint } from '@trailence/utils/latlng';

export class LeafletCircle extends Circle<Leaflet, LeafletCircle> implements LeafletPrimitive<CircleOptions, LeafletCircle> {

  constructor(
    id: string, position: EarthPoint, options: CircleOptions,
  ) {
    super(id, position, options, new LeafletPrimitiveEvents<CircleOptions, LeafletCircle>(
      () => this,
      () => this.marker?.options?.interactive === true,
      () => this.marker?.setStyle(this.getLeafletOptions()),
    ));
  }

  public get leafletEvents(): LeafletPrimitiveEvents<CircleOptions, LeafletCircle> { return this.events as LeafletPrimitiveEvents<CircleOptions, LeafletCircle>; }

  private marker?: L.CircleMarker;

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
      interactive: this.leafletEvents.isInteractive(),
    };
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
    this.marker.setStyle(this.getLeafletOptions());
  }

  getLayer(): L.Layer | undefined {
    return this.marker;
  }

}
