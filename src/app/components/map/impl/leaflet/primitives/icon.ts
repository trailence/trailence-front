import { IconOptions, IconPrimitive } from '@trailence/components/map/primitives/icon';
import { Leaflet } from '../leaflet';
import { LeafletPrimitive } from './primitive';
import * as L from 'leaflet';
import { LeafletPrimitiveEvents } from './events';
import { MapPointerEvent } from '@trailence/components/map/primitives/primitive';

export class LeafletIcon extends IconPrimitive<Leaflet> implements LeafletPrimitive {

  private marker?: L.Marker;
  public override readonly events: LeafletPrimitiveEvents<IconOptions, LeafletIcon> = new LeafletPrimitiveEvents<IconOptions, LeafletIcon>(
    this,
    () => this.marker?.options?.interactive === true,
    () => {
      if (!this.marker) return;
      this.marker.options.interactive = true; // TODO check if working
    },
  );

  protected override addPrimitiveToMap(renderer: Leaflet): void {
    if (this.options.rotateOnMouseOver) this.addRotateListener();
    this.marker = L.marker(
      this.position,
      {
        icon: this.buildIcon(),
        interactive: this.events.isInteractive(),
      }
    );
    this.marker.addTo(renderer.getLeafletMap()!);
  }

  private buildIcon() {
    return L.icon({
      iconUrl: this.buildIconUrl(),
      iconSize: [this.options.iconRenderSize.x, this.options.iconRenderSize.y],
      iconAnchor: this.buildAnchor(),
    });
  }

  private buildIconUrl(): string {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(typeof this.options.icon === 'string' ? this.options.icon : this.options.icon.outerHTML);
  }

  private buildAnchor(): [number, number] {
    switch (this.options.iconAnchor) {
      case 'center': return [this.options.iconRenderSize.x / 2, this.options.iconRenderSize.y / 2];
      case 'top-left': return [0, 0];
      case 'top-right': return [this.options.iconRenderSize.x - 1, 0];
      case 'top-center': return [this.options.iconRenderSize.x / 2, 0];
      case 'bottom-left': return [0, this.options.iconRenderSize.y - 1];
      case 'bottom-right': return [this.options.iconRenderSize.x - 1, this.options.iconRenderSize.y - 1];
      case 'bottom-center': return [this.options.iconRenderSize.x / 2, this.options.iconRenderSize.y - 1];
      case 'right-center': return [0, this.options.iconRenderSize.y / 2];
      case 'left-center': return [this.options.iconRenderSize.x - 1, this.options.iconRenderSize.y / 2];
    }
  }

  protected override removePrimitiveFromMap(): void {
    if (!this.marker) return;
    this.marker.remove();
    this.marker = undefined;
    this.rotateListener = undefined;
    this.events.removed();
  }

  protected override applyNewPosition(): void {
    this.marker?.setLatLng(this.position);
  }

  protected override applyNewOptions(renderer: Leaflet, previous: IconOptions): void {
    if (!this.marker) return;

    if (this.options.icon !== previous.icon) {
      this.marker.setIcon(this.buildIcon());
    }

    if (this.options.rotateOnMouseOver === true) this.addRotateListener();
    else this.removeRotateListener();
  }


  private rotateListener?: (event: MapPointerEvent | undefined) => void;
  private addRotateListener(): void {
    if (this.rotateListener) return;
    let rotate = false;
    this.rotateListener = event => {
      if (!this.marker) return;
      const icon = (this.marker as any)._icon as HTMLImageElement;
      const pos = (icon as any)._leaflet_pos as L.Point;
      // TODO check it is working: we used event.layerPoint, but here viewportPoint = event.containerPoint
      const mouse = event ? {x: event.viewportPoint.x - pos.x, y: event.viewportPoint.y - pos.y} : undefined;
      if (mouse && mouse.x > -23 && mouse.x < 23 && mouse.y > -43 && mouse.y < 3) {
        if (!rotate) {
          icon.style.transformOrigin = 'bottom center';
          const sign = mouse.x < 0 ? '' : '-';
          icon.style.transform = 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0px) rotateZ(' + sign + '90deg)'
          rotate = true;
        }
      } else if (rotate) {
        icon.style.transform = 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0px)'
        rotate = false;
      }
    };
    this.events.addHoverListener(this.rotateListener);
  }
  private removeRotateListener(): void {
    if (!this.rotateListener) return;
    this.events.removeHoveristener(this.rotateListener);
    this.rotateListener = undefined;
  }

  getLayer(): L.Layer | undefined {
    return this.marker;
  }
}
