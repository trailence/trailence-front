import { Injector } from '@angular/core';
import { MAP_GEOLOCATION_LAYER, MapElement, MapPrimitive } from '../map-element';
import { MapGeolocationService } from '@trailence/services/map/map-geolocation.service';
import { map, Observable } from 'rxjs';
import { EarthBBox } from '@trailence/utils/latlng';
import { MapRenderer } from '../impl/map-renderer';
import { Circle, CircleOptions } from '../primitives/circle';
import { Color } from '@trailence/utils/color';

const ACTIVE_FILL_COLOR = new Color(32, 32, 255, 0.75);
const INACTIVE_FILL_COLOR = new Color(85, 85, 85, 0.75);
const ACTIVE_STROKE_COLOR = new Color(32, 32, 255, 1);
const INACTIVE_STROKE_COLOR = new Color(85, 85, 85, 1);

export class GeoLocationCursor extends MapElement {

  constructor(
    private readonly injector: Injector,
  ) {
    super('geolocation', {layer: MAP_GEOLOCATION_LAYER});
  }

  public override get fitBounds(): EarthBBox | undefined { return undefined; }

  private _renderer?: MapRenderer;
  private _primitives?: Observable<MapPrimitive[]>;

  public override getPrimitives$(renderer: MapRenderer): Observable<MapPrimitive[]> {
    if (renderer === this._renderer && this._primitives) return this._primitives;
    this._renderer = renderer;
    let circle: Circle | undefined = undefined;
    this._primitives = this.injector.get(MapGeolocationService).position$.pipe(
      map(p => {
        if (p) {
          const options: CircleOptions = {
            position: {lat: p.lat, lng: p.lng},
            radius: 7,
            radiusUnit: 'pixel',
            fillColor: p.active ? ACTIVE_FILL_COLOR : INACTIVE_FILL_COLOR,
            strokeColor: p.active ? ACTIVE_STROKE_COLOR: INACTIVE_STROKE_COLOR,
            strokeWidth: 3,
          };
          if (circle) circle.setOptions(options);
          else circle = renderer.createCircle(this.id, options);
        } else if (circle) {
          circle = undefined;
        }
        return circle ? [circle] : [];
      }),
    );
    return this._primitives;
  }

}
