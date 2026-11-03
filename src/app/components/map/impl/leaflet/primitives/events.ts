import { MapPrimitive, MapPrimitiveEvents } from '@trailence/components/map/primitives/primitive';
import { Leaflet } from '../leaflet';
import { LeafletPrimitive } from './primitive';

export class LeafletPrimitiveEvents<O, P extends MapPrimitive<O, Leaflet> & LeafletPrimitive> extends MapPrimitiveEvents<O, Leaflet, P> {

  constructor(
    primitive: P,
    private readonly hasInteractiveOption: () => boolean,
    private readonly updateInteractiveOption: () => void,
  ) {
    super(primitive);
  }

  private leafletClickListener?: (event: L.LeafletMouseEvent) => void;

  public isInteractive(): boolean {
    return this.clickListeners.length > 0 || this.hoverListeners.length > 0;
  }

  public removed(): void {
    this.leafletClickListener = undefined;
  }

  protected override enableClickListeners(): void {
    const element = this.primitive.getLayer();
    if (element) {
      const wasInteractive = this.hasInteractiveOption();
      const isInteractive = this.isInteractive();
      if (wasInteractive !== isInteractive) this.updateInteractiveOption();
      this.listenClick(element);
    }
  }
  protected override disableClickListeners(): void {
    const element = this.primitive.getLayer();
    if (element) {
      const wasInteractive = this.hasInteractiveOption();
      const isInteractive = this.isInteractive();
      if (wasInteractive !== isInteractive) this.updateInteractiveOption();
      this.unlistenClick(element);
    }
  }

  private listenClick(element: L.Layer): void {
    if (this.leafletClickListener) return;
    this.leafletClickListener = event => {
      this.emitClick(() => {
        return {
          renderer: this.primitive.getRenderer()!,
          viewportPoint: event.containerPoint,
          geographicPoint: event.latlng,
        }
      });
    };
    element.on('click', this.leafletClickListener);
  }
  private unlistenClick(element: L.Layer): void {
    if (!this.leafletClickListener) return;
    element.off('click', this.leafletClickListener);
    this.leafletClickListener = undefined;
  }

  protected override enableHoverListeners(): void {
    const element = this.primitive.getLayer();
    if (element) {
      const wasInteractive = this.hasInteractiveOption();
      const isInteractive = this.isInteractive();
      if (wasInteractive !== isInteractive) this.updateInteractiveOption();
      this.listenHover(element);
    }
  }
  protected override disableHoverListeners(): void {
    const element = this.primitive.getLayer();
    if (element) {
      const wasInteractive = this.hasInteractiveOption();
      const isInteractive = this.isInteractive();
      if (wasInteractive !== isInteractive) this.updateInteractiveOption();
      this.unlistenHover(element);
    }
  }

  private listenHover(element: L.Layer): void {
    /* TODO:
    element.on('mouseover', null);
    element.on('mouseout', null);
    */
  }
  private unlistenHover(element: L.Layer): void {
    // TODO
  }

}
