import { EarthBBox } from '@trailence/utils/latlng';
import { BehaviorSubject, map, Observable } from 'rxjs';
import { MapRenderer } from './impl/map-renderer';
import { MapPrimitive } from './primitives/primitive';
import { MapPointerEvent } from './map-events';
import { Arrays } from '@trailence/utils/arrays';
import { MulticastObservable } from '@trailence/utils/rxjs/multicast-observable';
import { AppEvent } from '@trailence/utils/events';

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
export const MAP_WAYS_LAYER = 'ways';
export const MAP_POIS_LAYER = 'pois';
export const MAP_WAYPOINTS_LAYER = 'waypoints';
export const MAP_GEOLOCATION_LAYER = 'geolocation';
export const MAP_SELECTION_INDICATORS_LAYER = 'selection-indicators';

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
    name: MAP_WAYS_LAYER,
    zIndex: 120,
  },
  {
    name: MAP_POIS_LAYER,
    zIndex: 150,
  },
  {
    name: MAP_WAYPOINTS_LAYER,
    zIndex: 200,
  },
  {
    name: MAP_GEOLOCATION_LAYER,
    zIndex: 1000000,
  },
  {
    name: MAP_SELECTION_INDICATORS_LAYER,
    zIndex: 2000000,
  },
];

export abstract class AnyMapElement {
  public abstract readonly id: string;
  public abstract fitBounds$: Observable<EarthBBox | undefined>;
  public abstract getPositionOnMap$(): Observable<MapElementPosition>;
  public abstract getPrimitives$(renderer: MapRenderer): Observable<MapPrimitive<any, MapRenderer, any>[]>;
  public destroy() { /* nothing by default */ }
}

export abstract class MapElement<E> extends AnyMapElement {

  constructor(
    public override readonly id: string,
    initialPosition: MapElementPosition,
  ) {
    super();
    this.positionOnMap$ = new BehaviorSubject<MapElementPosition>(initialPosition);
  }

  public readonly events = new MapElementEvents<this, E>();

  private readonly positionOnMap$: BehaviorSubject<MapElementPosition>;
  public override getPositionOnMap$(): Observable<MapElementPosition> { return this.positionOnMap$; }
  public setPositionOnMap(position: MapElementPosition): this {
    if (position.behindId === this.positionOnMap$.value.behindId &&
        position.inFrontOfId === this.positionOnMap$.value.inFrontOfId &&
        position.layer === this.positionOnMap$.value.layer) return this;
    this.positionOnMap$.next(position);
    return this;
  }

  private _renderer?: MapRenderer;
  private _primitives?: MulticastObservable<MapPrimitive<any, MapRenderer, any>[]>;

  public override getPrimitives$(renderer: MapRenderer): Observable<MapPrimitive<any, MapRenderer, any>[]> {
    if (renderer === this._renderer && this._primitives) return this._primitives.asObservable();
    const previous = this._primitives?.getLatest();
    if (previous) for (const p of previous) this.unbind(p);
    this._renderer = renderer;
    this._primitives = new MulticastObservable<MapPrimitive<any, MapRenderer, any>[]>(
      () => {
        let previousPrimitives: MapPrimitive<any, MapRenderer, any>[] = [];
        return this.createPrimitives$(renderer).pipe(
          map(primitivesAndBinding => {
            const removed: MapPrimitive<any, MapRenderer, any>[] = [...previousPrimitives];
            const added: {primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: E}[] = [];
            const newList: MapPrimitive<any, MapRenderer, any>[] = [];
            for (const p of primitivesAndBinding) {
              const existing = Arrays.removeFirst(removed, p.primitive);
              if (!existing) added.push(p);
              newList.push(p.primitive);
            }
            for (const p of removed) this.unbind(p);
            for (const p of added) this.bind(p.primitive, p.eventBinding);
            return newList;
          })
        );
      }
    );
    return this._primitives.asObservable();
  }

  protected abstract createPrimitives$(renderer: MapRenderer): Observable<{primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: E}[]>;

  private bind(primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: E): void {
    this.events.click.bind(primitive.events.click, event => ({mapElement: this, element: eventBinding, pointerEvent: event.pointerEvent}));
    this.events.hover.bind(primitive.events.hover, event => ({mapElement: this, element: eventBinding, pointerEvent: event.pointerEvent}));
  }
  private unbind(primitive: MapPrimitive<any, MapRenderer, any>): void {
    this.events.click.unbind(primitive.events.click);
    this.events.hover.unbind(primitive.events.hover);
  }
}

export class MapElementEvents<T extends MapElement<U>, U> {
  public readonly click = new AppEvent<{mapElement: T, element: U, pointerEvent: MapPointerEvent}>();
  public readonly hover = new AppEvent<{mapElement: T, element: U, pointerEvent: MapPointerEvent | undefined}>();
}
