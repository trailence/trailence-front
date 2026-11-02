import { SvgBoundsPrimitive, SvgBoundsOptions } from '@trailence/components/map/primitives/svg';
import { LeafletPrimitive } from './primitive';
import { Leaflet } from '../leaflet';
import * as L from 'leaflet';
import { toLeafletBounds } from '../leaflet-utils';
import { EarthBBox } from '@trailence/utils/latlng';

export class LeafletSvgBounds extends SvgBoundsPrimitive<Leaflet> implements LeafletPrimitive {

  constructor(
    id: string,
    bounds: EarthBBox,
    private readonly svg: string | SVGSVGElement,
    options: SvgBoundsOptions,
  ) {
    super(id, bounds, options);
  }

  private overlay?: L.SVGOverlay;
  private clickListener?: (event: L.LeafletMouseEvent) => void;

  protected override addPrimitiveToMap(renderer: Leaflet): void {
    this.overlay = L.svgOverlay(this.svg, toLeafletBounds(this.bounds), this.getLeafletOptions());
    if (this.options.interactiveData !== undefined) this.addClickListener(this.overlay);
    this.overlay.addTo(renderer.getLeafletMap()!);
  }

  private getLeafletOptions(): L.ImageOverlayOptions {
    return {
      interactive: this.options.interactiveData !== undefined,
    };
  }

  private addClickListener(overlay: L.SVGOverlay): void {
    if (this.clickListener) return;
    this.clickListener = event => {
      (event.originalEvent as any)._interactiveData = this.options.interactiveData;
    };
    overlay.on('click', this.clickListener);
  }
  private removeClickListener(overlay: L.SVGOverlay): void {
    if (!this.clickListener) return;
    overlay.off('click', this.clickListener);
    this.clickListener = undefined;
  }

  protected override removePrimitiveFromMap(): void {
    if (!this.overlay) return;
    this.overlay.remove();
    this.overlay = undefined;
    this.clickListener = undefined;
  }

  protected override applyNewBounds(): void {
    this.overlay?.setBounds(toLeafletBounds(this.bounds));
  }

  protected override applyNewOptions(renderer: Leaflet, previous: SvgBoundsOptions): void {
    if (!this.overlay) return;
    if (this.options.interactiveData !== undefined) this.addClickListener(this.overlay);
    else this.removeClickListener(this.overlay);
  }

  getLayer(): L.Layer | undefined {
    return this.overlay;
  }
}
