import { IconOptions, IconPrimitive } from '@trailence/components/map/primitives/icon';
import { MapLibre } from '../maplibre';
import { MapLibrePrimitive } from './primitive';
import { Marker, Popup, PositionAnchor } from 'maplibre-gl';
import { MapLibrePrimitiveEvents } from './events';
import { samePoint } from '@trailence/utils/geometry-utils';
import { EarthPoint } from '@trailence/utils/latlng';

export class MapLibreIcon extends IconPrimitive<MapLibre, MapLibreIcon> implements MapLibrePrimitive {

  constructor(id: string, position: EarthPoint, options: IconOptions) {
    super(id, position, options, new MapLibrePrimitiveEvents<IconOptions, MapLibreIcon>());
  }

  private marker?: Marker;

  protected override addPrimitiveToMap(renderer: MapLibre): void {
    this.marker = new Marker({
      element: this.buildMarkerElement(),
      anchor: this.buildAnchor(),
      opacity: this.options.opacity,
      className: this.options.className,
      rotation: this.options.rotationWithMapDeg,
      rotationAlignment: this.options.rotationWithMapDeg !== undefined ? 'map' : undefined,
    });
    if (this.options.popup) {
      const popup = new Popup({className: this.options.popup.className});
      if (typeof this.options.popup.content === 'string')
        popup.setHTML(this.options.popup.content);
      else
        popup.setDOMContent(this.options.popup.content);
      this.marker.setPopup(popup);
    }
    this.marker.setLngLat(this.position);
    this.marker.addTo(renderer.getMaplibreMap()!);
    this.marker.on('click', e => this.events.click.trigger({primitive: this, pointerEvent: {
      renderer,
      nativeEvent: e.originalEvent,
      viewportPoint: {x: 0, y: 0}, // TODO
      geographicPoint: {lat: 0, lng: 0}, // TODO
    }}));
    // TODO hover and rotate
  }

  private buildMarkerElement(): HTMLElement {
    if ('svg' in this.options.icon) return this.buildSvgElement(this.options.icon.svg as unknown as HTMLElement);
    if ('svgString' in this.options.icon) return this.buildSvgElement(new DOMParser().parseFromString(this.options.icon.svgString, 'image/svg+xml').documentElement);
    if ('html' in this.options.icon) return this.options.icon.html;
    const div = document.createElement('DIV');
    div.innerHTML = this.options.icon.htmlString;
    const element = div.children.item(0)! as HTMLElement;
    element.style.width = this.options.iconSize.x + 'px';
    element.style.height = this.options.iconSize.y + 'px';
    return element;
  }

  private buildSvgElement(svg: HTMLElement): HTMLElement {
    svg.setAttribute('width', this.options.iconSize.x + 'px');
    svg.setAttribute('height', this.options.iconSize.y + 'px');
    return svg;
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
    if (this.options.icon !== previous.icon || !samePoint(this.options.iconSize, previous.iconSize) || this.options.iconAnchor !== previous.iconAnchor) {
      this.removePrimitiveFromMap(renderer);
      this.addPrimitiveToMap(renderer);
    } else {
      if ((this.options.opacity ?? 1) !== (previous.opacity ?? 1)) {
        this.marker.setOpacity(this.options.opacity);
      }
    }
  }

  getLayersIds(): string[] {
    return []; // TODO how to specify the position, may be marker is not what we want...
  }

}
