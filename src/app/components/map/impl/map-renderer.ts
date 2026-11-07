import { Injector } from '@angular/core';
import { MapState } from '../map-state';
import { Circle, CircleOptions } from '../primitives/circle';
import { EarthBBox, EarthPoint } from '@trailence/utils/latlng';
import { Polyline, PolylineOptions } from '../primitives/polyline';
import { MapPrimitive } from '../primitives/primitive';
import { Point2D } from '@trailence/utils/geometry-utils';
import { SvgBoundsOptions, SvgBoundsPrimitive } from '../primitives/svg';
import { IconOptions, IconPrimitive } from '../primitives/icon';
import { MapEvents } from '../map-events';

export type MapRendererType = 'leaflet' | 'maplibre';

export abstract class MapRenderer {

  constructor(
    protected readonly injector: Injector,
    protected readonly containerId: string,
    public readonly mapState: MapState,
    public readonly events: MapEvents,
  ) {}

  public abstract get type(): MapRendererType;

  public abstract init(): Promise<any>;
  public destroy(): void {
    for (const primitive of [...this.primitives]) this.remove(primitive); // NOSONAR
    this.destroyMap();
  }
  protected abstract destroyMap(): void;

  protected primitives: MapPrimitive<any, MapRenderer>[] = [];

  public add(primitive: MapPrimitive<any, MapRenderer>): void {
    if (this.primitives.includes(primitive)) throw new Error('Already on map');
    this.primitives.push(primitive);
    primitive.addToMap(this);
  }
  public remove(primitive: MapPrimitive<any, MapRenderer>): void {
    const index = this.primitives.indexOf(primitive);
    if (index < 0) return;
    this.primitives.splice(index, 1);
    primitive.removeFromMap(this);
  }

  public abstract bringToFront(primitive: MapPrimitive<any, MapRenderer>): void;

  public abstract goTo(center: EarthPoint, zoom: number | undefined, flying: boolean): void;

  public abstract getBounds(): EarthBBox | undefined;
  public abstract fitBounds(bounds: EarthBBox, flying: boolean): this;

  public abstract getMinZoom(): number;
  public abstract getMaxZoom(): number;
  public abstract zoomIn(): void;
  public abstract zoomOut(): void;

  public abstract setBearing(bearing: number, animate: boolean): void;

  public abstract createCircle(id: string, position: EarthPoint, options: CircleOptions): Circle<any>;
  public abstract createPolyline(id: string, positions: EarthPoint[][], options: PolylineOptions): Polyline<any>;
  public abstract createSvgBounds(id: string, bounds: EarthBBox, svg: string | SVGSVGElement, options: SvgBoundsOptions): SvgBoundsPrimitive<any>;
  public abstract createIcon(id: string, position: EarthPoint, options: IconOptions): IconPrimitive<any>;

  public abstract getViewportSize(): Point2D | undefined;
  public abstract projectToViewport(point: EarthPoint): Point2D;
  public abstract unprojectFromViewport(point: Point2D): EarthPoint;

  /** The map is not limited to -180 / 180 but -Infinity / Infinity, so for a given point
   * this method add the necessary offset for this point to be on the map.
   */
  public abstract getPointWithOffset(point: EarthPoint): EarthPoint;

}
