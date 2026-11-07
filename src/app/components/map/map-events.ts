import { Point2D } from '@trailence/utils/geometry-utils';
import { MapRenderer } from './impl/map-renderer';
import { EarthPoint } from '@trailence/utils/latlng';

export class MapEvents {

  public readonly click = new MapEventListeners<MapPointerEvent>();

}

export class MapEventListeners<T extends MapEvent> {

  private _listeners: MapEventListener<T>[] = [];

  public addListener(listener: MapEventListener<T>): void {
    this._listeners.push(listener);
  }
  public removeListener(listener: MapEventListener<T>): void {
    const index = this._listeners.indexOf(listener);
    if (index >= 0) this._listeners.splice(index, 1);
  }
  public trigger(event: () => T): void {
    if (this._listeners.length === 0) return;
    const e = event();
    const listeners = [...this._listeners];
    for (const listener of listeners) listener(e);
  }
}

export type MapEventListener<T extends MapEvent> = (event: T) => void;

export interface MapEvent {
  renderer: MapRenderer;
}

export interface MapPointerEvent extends MapEvent {
  viewportPoint: Point2D;
  geographicPoint: EarthPoint;
}
