import { EarthBBox } from '@trailence/utils/latlng';
import { BehaviorSubject, Observable } from 'rxjs';
import { MapRenderer } from './impl/map-renderer';
import { MapPrimitive } from './primitives/primitive';

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
export const MAP_WAYPOINTS_LAYER = 'waypoints';
export const MAP_GEOLOCATION_LAYER = 'geolocation';

export const MAP_ELEMENT_LAYERS: MapElementsLayer[] = [
  {
    name: MAP_TRACKS_LAYER,
    zIndex: 100,
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

  public abstract fitBounds: EarthBBox | undefined;

  private _renderer?: MapRenderer;
  private _primitives?: Observable<MapPrimitive<any>[]>;

  public getPrimitives$(renderer: MapRenderer): Observable<MapPrimitive<any>[]> {
    if (renderer === this._renderer && this._primitives) return this._primitives;
    this._renderer = renderer;
    this._primitives = this.createPrimitives$(renderer);
    return this._primitives;
  }

  protected abstract createPrimitives$(renderer: MapRenderer): Observable<MapPrimitive<any>[]>;
}
