import { MapLibre } from '../maplibre';
import { MapLibrePrimitive } from './primitive';
import { Marker, PositionAnchor } from 'maplibre-gl';
import { MapLibrePrimitiveEvents } from './events';
import { HtmlMarkerOptions, HtmlMarkerPrimitive } from '@trailence/components/map/primitives/html-marker';
import { EarthPoint } from '@trailence/utils/latlng';

export class MapLibreHtmlMarker extends HtmlMarkerPrimitive<MapLibre, MapLibreHtmlMarker> implements MapLibrePrimitive {

  constructor(id: string, position: EarthPoint, options: HtmlMarkerOptions) {
    super(id, position, options, new MapLibrePrimitiveEvents<HtmlMarkerOptions, MapLibreHtmlMarker>());
  }

  private marker?: Marker;

  protected override addPrimitiveToMap(renderer: MapLibre): void {
    this.marker = new Marker({
      element: this.buildElement(),
      anchor: this.buildAnchor(),
      className: this.options.className,
      opacity: this.options.opacity,
    });
    this.marker.setLngLat(this.position);
    this.marker.addTo(renderer.getMaplibreMap()!);
  }

  private buildElement(): HTMLElement {
    const container = document.createElement('DIV') as HTMLDivElement;
    container.className = 'html-marker';
    if (typeof this.options.html === 'string') container.innerHTML = this.options.html;
    else container.appendChild(this.options.html);
    return container;
  }

  private buildAnchor(): PositionAnchor {
    return this.options.anchorPos;
  }

  protected override removePrimitiveFromMap(renderer: MapLibre): void {
    this.marker?.remove();
    this.marker = undefined;
  }

  protected override applyNewPosition(): void {
    this.marker?.setLngLat(this.position);
  }

  protected override applyNewOptions(renderer: MapLibre, previous: HtmlMarkerOptions): void {
    if (!this.marker) return;
    // TODO
  }

  getLayersIds(): string[] {
    return []; // TODO how to specify the position, may be marker is not what we want...
  }

}
