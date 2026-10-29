import { Injector } from '@angular/core';
import { MapState } from '../map-state';
import { MapPrimitive } from '../map-element';
import { Circle, CircleOptions } from '../primitives/circle';

export type MapRendererType = 'leaflet' | 'maplibre';

export abstract class MapRenderer {

  constructor(
    protected readonly injector: Injector,
    protected readonly containerId: string,
    protected readonly mapState: MapState,
  ) {}

  public abstract get type(): MapRendererType;

  public abstract init(): Promise<any>;
  public abstract destroy(): void;

  public abstract add(primitive: MapPrimitive): void;
  public abstract remove(primitive: MapPrimitive): void;

  public abstract bringToFront(primitive: MapPrimitive): void;

  public abstract createCircle(id: string, options: CircleOptions): Circle;

}
