import { SvgBoundsPrimitive, SvgBoundsOptions } from '@trailence/components/map/primitives/svg';
import { LeafletPrimitive } from './primitive';
import { Leaflet } from '../leaflet';
import * as L from 'leaflet';
import { LeafletUtils } from '../leaflet-utils';
import { EarthBBox } from '@trailence/utils/latlng';
import { LeafletPrimitiveEvents } from './events';

export class LeafletSvgBounds extends SvgBoundsPrimitive<Leaflet, LeafletSvgBounds> implements LeafletPrimitive<SvgBoundsOptions, LeafletSvgBounds> {

  constructor(
    id: string,
    bounds: EarthBBox,
    private readonly svg: string | SVGSVGElement,
    options: SvgBoundsOptions,
  ) {
    super(id, bounds, options, new LeafletPrimitiveEvents<SvgBoundsOptions, LeafletSvgBounds>(
      () => this,
      () => this.overlay?.options?.interactive === true,
      () => this.overlay?.setStyle(this.getLeafletOptions()),
    ));
  }

  public get leafletEvents(): LeafletPrimitiveEvents<SvgBoundsOptions, LeafletSvgBounds> { return this.events as LeafletPrimitiveEvents<SvgBoundsOptions, LeafletSvgBounds>; }

  private overlay?: L.SVGOverlay;

  protected override addPrimitiveToMap(renderer: Leaflet): void {
    this.overlay = L.svgOverlay(this.svg, LeafletUtils.toLeafletBounds(this.bounds), this.getLeafletOptions());
    this.overlay.addTo(renderer.getLeafletMap()!);
  }

  private getLeafletOptions(): L.ImageOverlayOptions {
    return {
      interactive: this.leafletEvents.isInteractive(),
    };
  }

  protected override removePrimitiveFromMap(): void {
    if (!this.overlay) return;
    this.overlay.remove();
    this.overlay = undefined;
  }

  protected override applyNewBounds(): void {
    this.overlay?.setBounds(LeafletUtils.toLeafletBounds(this.bounds));
  }

  protected override applyNewOptions(renderer: Leaflet, previous: SvgBoundsOptions): void {
    if (!this.overlay) return;
  }

  getLayer(): L.Layer | undefined {
    return this.overlay;
  }
}
