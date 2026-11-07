import { MAP_GEOLOCATION_LAYER, MapElement } from '../map-element';
import { combineLatest, distinctUntilChanged, map, Observable } from 'rxjs';
import { earthBBox, EarthBBox, EarthPoint, samePosition } from '@trailence/utils/latlng';
import { MapRenderer } from '../impl/map-renderer';
import { Circle, CircleOptions } from '../primitives/circle';
import { Color } from '@trailence/utils/color';
import { MapPrimitive } from '../primitives/primitive';
import { GeolocationService } from '@trailence/services/geolocation/geolocation.service';
import { Injector } from '@angular/core';
import { TraceRecorderService } from '@trailence/services/trace-recorder/trace-recorder.service';

export const MY_POSITION_ACTIVE_FILL_COLOR = new Color(32, 32, 255, 0.75);
export const MY_POSITION_INACTIVE_FILL_COLOR = new Color(85, 85, 85, 0.75);
export const MY_POSITION_ACTIVE_STROKE_COLOR = new Color(32, 32, 255, 1);
export const MY_POSITION_INACTIVE_STROKE_COLOR = new Color(85, 85, 85, 1);

export const BUDDY_FILL_COLOR = new Color(255, 0, 255, 0.33);
export const BUDDY_STROKE_COLOR = new Color(255, 0, 255, 0.75);

export interface GeoLocationState {
  position: EarthPoint;
  fillColor: Color;
  strokeColor: Color;
}

export function createMyGeoLocationCursor(injector: Injector): GeoLocationCursor {
  const recorder = injector.get(TraceRecorderService);
  const geolocation = injector.get(GeolocationService);
  const position$ = combineLatest([
    recorder.current$,
    geolocation.watched$,
    geolocation.waitingForGps$
  ]).pipe(
    map(([recording, watched, waiting]) => {
      let position: EarthPoint | undefined;
      let active = true;
      if (recording) {
        position = recording.rawTrack.arrivalPoint?.pos;
        active = !recording.paused;
      }
      if (!position && watched?.l !== undefined && watched.n !== undefined) position = {lat: watched.l, lng: watched.n};
      if (!position) return undefined;
      active &&= !waiting;
      return {
        position,
        fillColor: active ? MY_POSITION_ACTIVE_FILL_COLOR : MY_POSITION_INACTIVE_FILL_COLOR,
        strokeColor: active ? MY_POSITION_ACTIVE_STROKE_COLOR : MY_POSITION_INACTIVE_STROKE_COLOR,
      };
    }),
    distinctUntilChanged((p, n) => {
      if (p === n) return true;
      if (p === undefined || n === undefined) return false;
      return samePosition(p.position, n.position) && Color.areSame(p.fillColor, n.fillColor) && Color.areSame(p.strokeColor, n.strokeColor);
    })
  );

  return new GeoLocationCursor('my-geolocation', position$);
}

export class GeoLocationCursor extends MapElement<GeoLocationCursor> {

  constructor(
    id: string,
    private readonly state$: Observable<GeoLocationState | undefined>,
  ) {
    super(id, {layer: MAP_GEOLOCATION_LAYER});
  }

  public override get fitBounds$(): Observable<EarthBBox | undefined> { return this.state$.pipe(map(state => state ? earthBBox(state.position, state.position) : undefined)); }

  protected override createPrimitives$(renderer: MapRenderer): Observable<MapPrimitive<any, any>[]> {
    let circle: Circle<any> | undefined = undefined;
    return this.state$.pipe(
      map(state => {
        if (state) {
          const options: CircleOptions = {
            radius: 7,
            radiusUnit: 'pixel',
            fillColor: state.fillColor,
            strokeColor: state.strokeColor,
            strokeWidth: 3,
          };
          if (circle) {
            circle.setPosition(state.position);
            circle.setOptions(options);
          } else {
            circle = renderer.createCircle(this.id, state.position, options);
          }
        } else if (circle) {
          circle = undefined;
        }
        return circle ? [circle] : [];
      }),
    );
  }

}
