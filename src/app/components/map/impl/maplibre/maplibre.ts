import { MapLibreMap } from 'maplibre-gl';
import { MapRenderer, MapRendererType } from '../map-renderer';
import { CircleOptions } from '../../primitives/circle';
import { MapLibreCircle } from './primitives/circle';
import { MapLibrePrimitive } from './primitives/primitive';
import { MapPrimitive } from '../../primitives/primitive';
import { EarthBBox, EarthPoint } from '@trailence/utils/latlng';
import { PolylineOptions } from '../../primitives/polyline';
import { MapLibrePolyline } from './primitives/polyline';
import { Point2D } from '@trailence/utils/geometry-utils';
import { SvgBoundsOptions } from '../../primitives/svg';
import { MapLibreSvgBounds } from './primitives/svg';
import { MapLibreUtils } from './maplibre-utils';

export class MapLibre extends MapRenderer {

  private map?: MapLibreMap;

  public override get type(): MapRendererType { return 'maplibre'; }

  public getMaplibreMap(): MapLibreMap | undefined { return this.map; }

  public override async init() {
    return new Promise(resolve => {
      this.map = new MapLibreMap({
        container: this.containerId,
        center: this.mapState.center,
        zoom: this.mapState.zoom,
        bearing: this.mapState.bearing,
      });
      this.map.on('style.load', () => resolve(true));
    });
  }

  protected override destroyMap(): void {
    this.map?.remove();
  }

  public override bringToFront(primitive: MapPrimitive<any, MapRenderer>): void {
    (primitive as unknown as MapLibrePrimitive).getLayersIds().forEach(id => this.map!.moveLayer(id));
  }

  public override getBounds(): EarthBBox | undefined {
    return this.map ? MapLibreUtils.fromMapLibreBounds(this.map.getBounds()) : undefined;
  }
  public override fitBounds(bounds: EarthBBox): this {
    this.map?.fitBounds(MapLibreUtils.toMapLibreBounds(bounds));
    return this;
  }

  public override goTo(center: EarthPoint, zoom?: number): void {
    this.map?.flyTo({
      center,
      zoom,
    });
  }

  public override getMinZoom(): number {
    return this.map?.getMinZoom() ?? 1;
  }
  public override getMaxZoom(): number {
    return this.map?.getMaxZoom() ?? 1;
  }
  public override zoomIn(): void {
    this.map?.zoomIn();
  }
  public override zoomOut(): void {
    this.map?.zoomOut();
  }

  public override setBearing(bearing: number, animate: boolean): void {
    this.map?.setBearing(bearing); // TODO animate ??
  }

  public override createCircle(id: string, position: EarthPoint, options: CircleOptions) {
    return new MapLibreCircle(id, position, options);
  }

  public override createPolyline(id: string, positions: EarthPoint[][], options: PolylineOptions) {
    return new MapLibrePolyline(id, positions, options);
  }

  public override createSvgBounds(id: string, bounds: EarthBBox, svg: string | SVGSVGElement, options: SvgBoundsOptions) {
    return new MapLibreSvgBounds(id, bounds, svg, options);
  }

  public override getViewportSize(): Point2D | undefined {
    const container = this.map?.getContainer();
    if (!container) return undefined;
    return {x: container.clientWidth, y: container.clientHeight};
  }

  public override projectToViewport(point: EarthPoint): Point2D {
    return this.map!.project(point);
  }

  public override unprojectFromViewport(point: Point2D): EarthPoint {
    return this.map!.unproject([point.x, point.y]);
  }

  public override getPointWithOffset(point: EarthPoint): EarthPoint {
    // TODO
    return point;
  }

}
