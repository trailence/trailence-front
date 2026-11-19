import { Leaflet } from '../leaflet';
import { LeafletPrimitive } from './primitive';
import * as L from 'leaflet';
import { LeafletPrimitiveEvents } from './events';
import { HtmlMarkerOptions, HtmlMarkerPrimitive } from '@trailence/components/map/primitives/html-marker';
import { EarthPoint } from '@trailence/utils/latlng';

export class LeafletHtmlMarker extends HtmlMarkerPrimitive<Leaflet, LeafletHtmlMarker> implements LeafletPrimitive<HtmlMarkerOptions, LeafletHtmlMarker> {

  constructor(id: string, position: EarthPoint, options: HtmlMarkerOptions) {
    super(id, position, options, new LeafletPrimitiveEvents<HtmlMarkerOptions, LeafletHtmlMarker>(
      () => this,
      () => false, // TODO
      () => {}, // TODO
    ));
  }

  public get leafletEvents(): LeafletPrimitiveEvents<HtmlMarkerOptions, LeafletHtmlMarker> { return this.events as LeafletPrimitiveEvents<HtmlMarkerOptions, LeafletHtmlMarker>; }

  private tooltip?: L.Tooltip;

  protected override addPrimitiveToMap(renderer: Leaflet): void {
    this.tooltip = L.tooltip({
      content: this.options.html,
      direction: this.getDirection(),
      className: this.options.className,
      opacity: this.options.opacity,
    });
    this.tooltip.setLatLng(this.position);
    this.tooltip.addTo(renderer.getLeafletMap()!);
  }

  private getDirection() {
    switch (this.options.anchorPos) {
      case 'left': return 'right';
      case 'right': return 'left';
      case 'bottom': return 'top';
      case 'top': return 'bottom';
    }
  }

  protected override removePrimitiveFromMap(): void {
    if (!this.tooltip) return;
    this.tooltip.remove();
    this.tooltip = undefined;
  }

  protected override applyNewPosition(): void {
    this.tooltip?.setLatLng(this.position);
  }

  protected override applyNewOptions(renderer: Leaflet, previous: HtmlMarkerOptions): void {
    if (!this.tooltip) return;
    // TODO
  }

  getLayer(): L.Layer | undefined {
    return this.tooltip;
  }
}
