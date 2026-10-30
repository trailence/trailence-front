import { Injector } from '@angular/core';
import { MapState } from '../map-state';
import { Circle, CircleOptions } from '../primitives/circle';
import { EarthPoint } from '@trailence/utils/latlng';
import { Polyline, PolylineOptions } from '../primitives/polyline';
import { MapPrimitive } from '../primitives/primitive';
import { Point2D } from '@trailence/utils/geometry-utils';

export type MapRendererType = 'leaflet' | 'maplibre';

export abstract class MapRenderer {

  constructor(
    protected readonly injector: Injector,
    protected readonly containerId: string,
    public readonly mapState: MapState,
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

  public abstract createCircle(id: string, position: EarthPoint, options: CircleOptions): Circle<any>;
  public abstract createPolyline(id: string, positions: EarthPoint[][], options: PolylineOptions): Polyline<any>;

  public abstract projectToViewport(point: EarthPoint): Point2D;
  public abstract unprojectFromViewport(point: Point2D): EarthPoint;

  /** The map is not limited to -180 / 180 but -Infinity / Infinity, so for a given point
   * this method add the necessary offset for this point to be on the map.
   */
  public abstract getPointWithOffset(point: EarthPoint): EarthPoint;

}
