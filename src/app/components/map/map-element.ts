import { EarthBBox, EarthPoint } from '@trailence/utils/latlng';
import { BehaviorSubject, Observable } from 'rxjs';
import { MapRenderer } from './impl/map-renderer';
import { MapPrimitive } from './primitives/primitive';
import { Point2D } from '@trailence/utils/geometry-utils';

export interface MapElementPosition {
  layer: string;
  behindId?: string;
  inFrontOfId?: string;
}

export interface MapElementsLayer {
  name: string;
  zIndex: number;
}

export const MAP_TRACKS_LAYER = 'tracks';
export const MAP_SELECTED_TRACK_LAYER = 'selected-track';
export const MAP_WAYPOINTS_LAYER = 'waypoints';
export const MAP_GEOLOCATION_LAYER = 'geolocation';

export const MAP_ELEMENT_LAYERS: MapElementsLayer[] = [
  {
    name: MAP_TRACKS_LAYER,
    zIndex: 100,
  },
  {
    name: MAP_SELECTED_TRACK_LAYER,
    zIndex: 101,
  },
  {
    name: MAP_WAYPOINTS_LAYER,
    zIndex: 200,
  },
  {
    name: MAP_GEOLOCATION_LAYER,
    zIndex: 1000000,
  },
];


export abstract class MapElement {

  constructor(
    public readonly id: string,
    initialPosition: MapElementPosition,
  ) {
    this.positionOnMap$ = new BehaviorSubject<MapElementPosition>(initialPosition);
  }

  public readonly events = new MapElementEvents(this);

  public destroy() { /* nothing by default */ }

  private readonly positionOnMap$: BehaviorSubject<MapElementPosition>;
  public getPositionOnMap$(): Observable<MapElementPosition> { return this.positionOnMap$; }
  public setPositionOnMap(position: MapElementPosition): this {
    if (position.behindId === this.positionOnMap$.value.behindId &&
        position.inFrontOfId === this.positionOnMap$.value.inFrontOfId &&
        position.layer === this.positionOnMap$.value.layer) return this;
    this.positionOnMap$.next(position);
    return this;
  }

  public abstract fitBounds$: Observable<EarthBBox | undefined>;

  private _renderer?: MapRenderer;
  private _primitives?: Observable<MapPrimitive<any, MapRenderer>[]>;

  public getPrimitives$(renderer: MapRenderer): Observable<MapPrimitive<any, MapRenderer>[]> {
    if (renderer === this._renderer && this._primitives) return this._primitives;
    this._renderer = renderer;
    this._primitives = this.createPrimitives$(renderer);
    return this._primitives;
  }

  protected abstract createPrimitives$(renderer: MapRenderer): Observable<MapPrimitive<any, MapRenderer>[]>;
}

export class MapElementEvents {

  constructor(
    private readonly mapElement: MapElement,
  ) {}

  private readonly bound: MapPrimitive<any, any>[] = [];

  bind(primitive: MapPrimitive<any, any>): void {
    this.bound.push(primitive);
    for (const listener of this.clickListeners) this.bindClick(primitive, listener);
  }

  unbind(primitive: MapPrimitive<any, any>): void {
    const index = this.bound.indexOf(primitive);
    if (index >= 0) {
      this.bound.splice(index, 1);
      for (const listener of this.clickListeners) this.unbindClick(primitive, listener);
    }
  }

  private readonly clickListeners: InternalListener<MapElementPointerEvent>[] = [];

  public addClickListener(listener: (mapElement: MapElement, event: MapElementPointerEvent) => void): this {
    const l: InternalListener<MapElementPointerEvent> = { external: listener, internal: event => listener(this.mapElement, event) };
    this.clickListeners.push(l);
    for (const primitive of this.bound) this.bindClick(primitive, l);
    return this;
  }
  public removeClickListener(listener: (mapElement: MapElement, event: MapElementPointerEvent) => void): this {
    const index = this.clickListeners.findIndex(l => l.external === listener);
    if (index >= 0) {
      const l = this.clickListeners.splice(index, 1)[0];
      for (const primitive of this.bound) this.unbindClick(primitive, l);
    }
    return this;
  }
  private bindClick(primitive: MapPrimitive<any, any>, listener: InternalListener<MapElementPointerEvent>): void {
    primitive.events.addClickListener(listener.internal);
  }
  private unbindClick(primitive: MapPrimitive<any, any>, listener: InternalListener<MapElementPointerEvent>): void {
    primitive.events.removeClickListener(listener.internal);
  }

  private readonly hoverListeners: InternalListener<MapElementPointerEvent | undefined>[] = [];

  public addHoverListener(listener: (mapElement: MapElement, event: MapElementPointerEvent | undefined) => void): this {
    const l: InternalListener<MapElementPointerEvent | undefined> = { external: listener, internal: event => listener(this.mapElement, event) };
    this.hoverListeners.push(l);
    for (const primitive of this.bound) this.bindHover(primitive, l);
    return this;
  }
  public removeHoverListener(listener: (mapElement: MapElement, event: MapElementPointerEvent | undefined) => void): this {
    const index = this.hoverListeners.findIndex(l => l.external === listener);
    if (index >= 0) {
      const l = this.hoverListeners.splice(index, 1)[0];
      for (const primitive of this.bound) this.unbindHover(primitive, l);
    }
    return this;
  }
  private bindHover(primitive: MapPrimitive<any, any>, listener: InternalListener<MapElementPointerEvent | undefined>): void {
    primitive.events.addHoverListener(listener.internal);
  }
  private unbindHover(primitive: MapPrimitive<any, any>, listener: InternalListener<MapElementPointerEvent | undefined>): void {
    primitive.events.removeHoverListener(listener.internal);
  }

}

interface InternalListener<E> {
  external: (mapElement: MapElement, event: E) => void;
  internal: (event: E) => void;
}

export interface MapElementPointerEvent {
  renderer: MapRenderer;
  viewportPoint: Point2D;
  geographicPoint: EarthPoint;
}
