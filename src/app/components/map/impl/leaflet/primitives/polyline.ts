import { Polyline, PolylineOptions } from '@trailence/components/map/primitives/polyline';
import { LeafletPrimitive } from './primitive';
import * as L from 'leaflet';
import { Color } from '@trailence/utils/color';
import { Leaflet } from '../leaflet';
import { LeafletPrimitiveEvents } from './events';

export class LeafletPolyline extends Polyline<Leaflet> implements LeafletPrimitive {

  private polyline: L.Polyline | undefined;
  public override readonly events: LeafletPrimitiveEvents<PolylineOptions, LeafletPolyline> = new LeafletPrimitiveEvents<PolylineOptions, LeafletPolyline>(
    this,
    () => this.polyline?.options?.interactive === true,
    () => this.polyline?.setStyle(this.getLeafletOptions()),
  );

  protected override addPrimitiveToMap(renderer: Leaflet): void {
    this.polyline = L.polyline(this.positions, this.getLeafletOptions());
    this.polyline.addTo((renderer as Leaflet).getLeafletMap()!);
  }

  private getLeafletOptions(): L.PolylineOptions {
    return {
      color: this.options.color.toString(),
      weight: this.options.width,
      interactive: this.events.isInteractive(),
      // TODO className
    };
  }

  protected override removePrimitiveFromMap(): void {
    if (!this.polyline) return;
    this.polyline.remove();
    this.polyline = undefined;
    this.events.removed();
  }

  protected override applyNewPositions(): void {
    this.polyline?.setLatLngs(this.positions);
  }

  protected override applyNewOptions(_: Leaflet, previous: PolylineOptions): void {
    if (!this.polyline) return;
    if (!Color.areSame(previous.color, this.options.color) || previous.width !== this.options.width) {
      this.polyline.setStyle(this.getLeafletOptions());
    }
  }

  getLayer(): L.Layer | undefined {
    return this.polyline;
  }

}
