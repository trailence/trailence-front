import { IconOptions, IconPrimitive } from '@trailence/components/map/primitives/icon';
import { MapLibre } from '../maplibre';
import { MapLibrePrimitive } from './primitive';
import { Marker, PositionAnchor } from 'maplibre-gl';
import { MapLibrePrimitiveEvents } from './events';
import { samePoint } from '@trailence/utils/geometry-utils';

export class MapLibreIcon extends IconPrimitive<MapLibre> implements MapLibrePrimitive {

  private marker?: Marker;
  public readonly events: MapLibrePrimitiveEvents<IconOptions, MapLibreIcon> = new MapLibrePrimitiveEvents<IconOptions, MapLibreIcon>(this);

  protected override addPrimitiveToMap(renderer: MapLibre): void {
    this.marker = new Marker({
      element: this.buildSvg(),
      anchor: this.buildAnchor(),
    });
    this.marker.setLngLat(this.position);
    this.marker.addTo(renderer.getMaplibreMap()!);
    // TODO click and rotate
  }

  private buildSvg(): HTMLElement {
    const svg = typeof this.options.icon === 'string' ? new DOMParser().parseFromString(this.options.icon, 'image/svg+xml').documentElement : this.options.icon;
    svg.setAttribute('width', this.options.iconRenderSize.x + 'px');
    svg.setAttribute('height', this.options.iconRenderSize.y + 'px');
    return svg as HTMLElement;
  }

  private buildAnchor(): PositionAnchor {
    switch (this.options.iconAnchor) {
      case 'center':
      case 'top-left':
      case 'top-right':
      case 'bottom-left':
      case 'bottom-right': return this.options.iconAnchor;
      case 'top-center': return 'top';
      case 'bottom-center': return 'bottom';
      case 'right-center': return 'right';
      case 'left-center': return 'left';
    }
  }

  protected override removePrimitiveFromMap(renderer: MapLibre): void {
    this.marker?.remove();
    this.marker = undefined;
  }

  protected override applyNewPosition(): void {
    this.marker?.setLngLat(this.position);
  }

  protected override applyNewOptions(renderer: MapLibre, previous: IconOptions): void {
    if (!this.marker) return;
    if (this.options.icon !== previous.icon || !samePoint(this.options.iconRenderSize, previous.iconRenderSize || this.options.iconAnchor !== previous.iconAnchor)) {
      this.removePrimitiveFromMap(renderer);
      this.addPrimitiveToMap(renderer);
    }
  }

  getLayersIds(): string[] {
    return []; // TODO how to specify the position, may be marker is not what we want...
  }

}
