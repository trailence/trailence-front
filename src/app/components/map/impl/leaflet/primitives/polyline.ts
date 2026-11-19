import { Polyline, PolylineOptions } from '@trailence/components/map/primitives/polyline';
import { LeafletPrimitive } from './primitive';
import * as L from 'leaflet';
import { Color } from '@trailence/utils/color';
import { Leaflet } from '../leaflet';
import { LeafletPrimitiveEvents } from './events';
import { EarthPoint } from '@trailence/utils/latlng';

export class LeafletPolyline extends Polyline<Leaflet, LeafletPolyline> implements LeafletPrimitive<PolylineOptions, LeafletPolyline> {

  constructor(id: string, positions: EarthPoint[][], options: PolylineOptions) {
    super(id, positions, options, new LeafletPrimitiveEvents<PolylineOptions, LeafletPolyline>(
      () => this,
      () => this.polyline?.options?.interactive === true,
      () => this.polyline?.setStyle(this.getLeafletOptions()),
    ));
  }

  public get leafletEvents(): LeafletPrimitiveEvents<PolylineOptions, LeafletPolyline> { return this.events as LeafletPrimitiveEvents<PolylineOptions, LeafletPolyline>; }

  private polyline: L.Polyline | undefined;

  protected override addPrimitiveToMap(renderer: Leaflet): void {
    this.polyline = L.polyline(this.positions, this.getLeafletOptions());
    this.polyline.addTo((renderer as Leaflet).getLeafletMap()!);
  }

  private getLeafletOptions(): L.PolylineOptions {
    return {
      color: this.options.color.toHexString(false),
      weight: this.options.width,
      interactive: this.leafletEvents.isInteractive(),
      dashArray: this.options.dashArray?.map((v,i) => (i % 2) === 0 ? v : v * this.options.width)?.join(' '),
      opacity: this.options.color.a,
      // TODO className
    };
  }

  protected override removePrimitiveFromMap(): void {
    if (!this.polyline) return;
    this.polyline.remove();
    this.polyline = undefined;
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
