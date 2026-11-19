import { MapPrimitive, MapPrimitiveEvents } from '@trailence/components/map/primitives/primitive';
import { Leaflet } from '../leaflet';
import { LeafletPrimitive } from './primitive';
import { LeafletUtils } from '../leaflet-utils';

export class LeafletPrimitiveEvents<O, P extends MapPrimitive<O, Leaflet, P> & LeafletPrimitive<O,P>> extends MapPrimitiveEvents<O, Leaflet, P> {

  constructor(
    private readonly getPrimitive: () => P,
    private readonly hasInteractiveOption: () => boolean,
    private readonly updateInteractiveOption: () => void,
  ) {
    super();
    this.addedToMap.addListener(() => {
      if (this.click.hasListeners()) this._listenClick();
      if (this.hover.hasListeners()) this._listenHover();
    });
    this.removedFromMap.addListener(() => {
      this._unlistenClick();
      this._unlistenHover();
    });
    this.click.onListenersChanged(hasListeners => hasListeners ? this._listenClick() : this._unlistenClick());
    this.hover.onListenersChanged(hasListeners => hasListeners ? this._listenHover() : this._unlistenHover())
  }

  public isInteractive(): boolean {
    return this.click.hasListeners() || this.hover.hasListeners();
  }

  public layerChanged(): void {
    if (this._leafletClick) {
      this._unlistenClick();
      this._listenClick();
    }
    if (this._leafletHover) {
      this._unlistenHover();
      this._listenHover();
    }
  }

  private _updateInteractive(): void {
    const wasInteractive = this.hasInteractiveOption();
    const isInteractive = this.isInteractive();
    if (wasInteractive !== isInteractive) this.updateInteractiveOption();
  }

  // --- click ---

  private _leafletClick?: {listener: (event: L.LeafletMouseEvent) => void, layer: L.Layer};
  private _listenClick(): void {
    if (this._leafletClick) return;
    const layer = this.getPrimitive().getLayer();
    if (!layer) return;
    const listener = (event: L.LeafletMouseEvent) => {
      const primitive = this.getPrimitive();
      this.click.trigger({primitive, pointerEvent: LeafletUtils.toMapPointerEvent(primitive.getRenderer()!, event)});
    };
    this._leafletClick = {layer, listener};
    layer.on('click', listener);
    this._updateInteractive();
  }
  private _unlistenClick(): void {
    if (!this._leafletClick) return;
    this._leafletClick.layer.off('click', this._leafletClick.listener);
    this._leafletClick = undefined;
    this._updateInteractive();
  }

  // --- hover ---

  private _leafletHover?: {hoverListener: (event: L.LeafletMouseEvent) => void, outListener: (event: L.LeafletMouseEvent) => void, layer: L.Layer};
  private _listenHover(): void {
    if (this._leafletHover) return;
    const layer = this.getPrimitive().getLayer();
    if (!layer) return;
    let isHover = false;
    const hoverListener = (event: L.LeafletMouseEvent) => {
      isHover = true;
      if ((event.originalEvent as any)['_layerCatch']) {
        (event.originalEvent as any)._layerCatch.push(layer);
      } else {
        (event.originalEvent as any)._layerCatch = [layer];
      }
      const primitive = this.getPrimitive();
      this.hover.trigger({primitive, pointerEvent: LeafletUtils.toMapPointerEvent(primitive.getRenderer()!, event)});
    };
    const outListener = (event: L.LeafletMouseEvent) => {
      if (!isHover) return;
      isHover = false;
      this.hover.trigger({primitive: this.getPrimitive(), pointerEvent: undefined});
    };
    this._leafletHover = {layer, hoverListener, outListener};
    layer.on('mouseout', outListener);
    layer.on('mousemove', hoverListener);
    this._updateInteractive();
  }
  private _unlistenHover(): void {
    if (!this._leafletHover) return;
    this._leafletHover.layer.off('mouseover', this._leafletHover.hoverListener);
    this._leafletHover.layer.off('mouseout', this._leafletHover.outListener);
    this._leafletHover = undefined;
    this._updateInteractive();
  }

}
