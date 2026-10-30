import { Polyline, PolylineOptions } from '@trailence/components/map/primitives/polyline';
import { LeafletPrimitive } from './primitive';
import * as L from 'leaflet';
import { Color } from '@trailence/utils/color';
import { Leaflet } from '../leaflet';

export class LeafletPolyline extends Polyline<Leaflet> implements LeafletPrimitive {

  private polyline: L.Polyline | undefined;
  private clickListener?: (event: L.LeafletMouseEvent) => void;

  protected override addPrimitiveToMap(renderer: Leaflet): void {
    this.polyline = L.polyline(this.positions, this.getLeafletOptions());
    if (this.options.interactiveData !== undefined) this.addClickListener(this.polyline);
    this.polyline.addTo((renderer as Leaflet).getLeafletMap()!);
  }

  private getLeafletOptions(): L.PolylineOptions {
    return {
      color: this.options.color.toString(),
      weight: this.options.width,
      interactive: this.options.interactiveData !== undefined,
      // TODO className
    };
  }

  private addClickListener(polyline: L.Polyline): void {
    if (this.clickListener) return;
    this.clickListener = event => {
      (event.originalEvent as any)._interactiveData = this.options.interactiveData;
    };
    polyline.on('click', this.clickListener);
  }
  private removeClickListener(polyline: L.Polyline): void {
    if (!this.clickListener) return;
    polyline.off('click', this.clickListener);
    this.clickListener = undefined;
  }

  protected override removePrimitiveFromMap(): void {
    if (!this.polyline) return;
    this.polyline.remove();
    this.polyline = undefined;
    this.clickListener = undefined;
  }

  protected override applyNewPositions(): void {
    this.polyline?.setLatLngs(this.positions);
  }

  protected override applyNewOptions(_: Leaflet, previous: PolylineOptions): void {
    if (!this.polyline) return;
    if (!Color.areSame(previous.color, this.options.color) || previous.width !== this.options.width || (previous.interactiveData === undefined) !== (this.options.interactiveData === undefined)) {
      this.polyline.setStyle(this.getLeafletOptions());
    }
    if (this.options.interactiveData !== undefined) this.addClickListener(this.polyline);
    else this.removeClickListener(this.polyline);
  }

  getLayer(): L.Layer | undefined {
    return this.polyline;
  }

}
