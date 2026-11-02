import { IconOptions, IconPrimitive } from '@trailence/components/map/primitives/icon';
import { Leaflet } from '../leaflet';
import { LeafletPrimitive } from './primitive';
import * as L from 'leaflet';

export class LeafletIcon extends IconPrimitive<Leaflet> implements LeafletPrimitive {

  private marker?: L.Marker;
  private clickListener?: (event: L.LeafletMouseEvent) => void;
  private mouseMoveListener?: (event: L.LeafletMouseEvent) => void;

  protected override addPrimitiveToMap(renderer: Leaflet): void {
    this.marker = L.marker(
      this.position,
      {
        icon: this.buildIcon(),
        interactive: this.options.interactiveData !== undefined,
      }
    );
    if (this.options.interactiveData !== undefined) this.addClickListener(this.marker);
    if (this.options.rotateOnMouseOver === true) this.addMouseMoveListener(this.marker);
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

  private addClickListener(marker: L.Marker): void {
    if (this.clickListener) return;
    this.clickListener = event => {
      (event.originalEvent as any)._interactiveData = this.options.interactiveData;
    };
    marker.on('click', this.clickListener);
  }
  private removeClickListener(marker: L.Marker): void {
    if (!this.clickListener) return;
    marker.off('click', this.clickListener);
    this.clickListener = undefined;
  }

  private addMouseMoveListener(marker: L.Marker): void {
    if (this.mouseMoveListener) return;
    let rotate = false;
    this.mouseMoveListener = event => {
      const icon = (marker as any)._icon as HTMLImageElement;
      const pos = (icon as any)._leaflet_pos as L.Point;
      const mouseX = event.layerPoint.x - pos.x;
      const mouseY = event.layerPoint.y - pos.y;
      if (mouseX > -23 && mouseX < 23 && mouseY > -43 && mouseY < 3) {
        if (!rotate) {
          icon.style.transformOrigin = 'bottom center';
          const sign = mouseX < 0 ? '' : '-';
          icon.style.transform = 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0px) rotateZ(' + sign + '90deg)'
          rotate = true;
        }
      } else if (rotate) {
        icon.style.transform = 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0px)'
        rotate = false;
      }
    };
    marker.on('mousemove', this.mouseMoveListener);
  }
  private removeMouseMoveListener(marker: L.Marker): void {
    if (!this.mouseMoveListener) return;
    marker.off('mousemove', this.mouseMoveListener);
    this.mouseMoveListener = undefined;
  }

  protected override removePrimitiveFromMap(): void {
    if (!this.marker) return;
    this.marker.remove();
    this.marker = undefined;
    this.clickListener = undefined;
    this.mouseMoveListener = undefined;
  }

  protected override applyNewPosition(): void {
    this.marker?.setLatLng(this.position);
  }

  protected override applyNewOptions(renderer: Leaflet, previous: IconOptions): void {
    if (!this.marker) return;

    if (this.options.icon !== previous.icon) {
      this.marker.setIcon(this.buildIcon());
    }

    if (this.options.interactiveData !== undefined) this.addClickListener(this.marker);
    else this.removeClickListener(this.marker);

    if (this.options.rotateOnMouseOver === true) this.addMouseMoveListener(this.marker);
    else this.removeMouseMoveListener(this.marker);
  }

  getLayer(): L.Layer | undefined {
    return this.marker;
  }
}
