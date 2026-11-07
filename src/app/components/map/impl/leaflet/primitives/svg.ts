import { SvgBoundsPrimitive, SvgBoundsOptions } from '@trailence/components/map/primitives/svg';
import { LeafletPrimitive } from './primitive';
import { Leaflet } from '../leaflet';
import * as L from 'leaflet';
import { LeafletUtils } from '../leaflet-utils';
import { EarthBBox } from '@trailence/utils/latlng';
import { LeafletPrimitiveEvents } from './events';

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
  public override readonly events: LeafletPrimitiveEvents<SvgBoundsOptions, LeafletSvgBounds> = new LeafletPrimitiveEvents<SvgBoundsOptions, LeafletSvgBounds>(
    this,
    () => this.overlay?.options?.interactive === true,
    () => this.overlay?.setStyle(this.getLeafletOptions()),
  );

  protected override addPrimitiveToMap(renderer: Leaflet): void {
    this.overlay = L.svgOverlay(this.svg, LeafletUtils.toLeafletBounds(this.bounds), this.getLeafletOptions());
    this.overlay.addTo(renderer.getLeafletMap()!);
  }

  private getLeafletOptions(): L.ImageOverlayOptions {
    return {
      interactive: this.events.isInteractive(),
    };
  }

  protected override removePrimitiveFromMap(): void {
    if (!this.overlay) return;
    this.overlay.remove();
    this.overlay = undefined;
    this.events.removed();
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
