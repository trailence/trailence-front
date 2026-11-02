import { IconOptions, IconPrimitive } from '@trailence/components/map/primitives/icon';
import { MapLibre } from '../maplibre';
import { MapLibrePrimitive } from './primitive';
import { Marker, PositionAnchor } from 'maplibre-gl';

export class MapLibreIcon extends IconPrimitive<MapLibre> implements MapLibrePrimitive {

  private marker?: Marker;

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
    if (typeof this.options.icon === 'string') {
      return new DOMParser().parseFromString(this.options.icon, 'image/svg+xml').documentElement;
    }
    const div = document.createElement('DIV');
    div.appendChild(this.options.icon);
    return div;
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
    // TODO
  }

  getLayersIds(): string[] {
    return []; // TODO how to specify the position, may be marker is not what we want...
  }

}
