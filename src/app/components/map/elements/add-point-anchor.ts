import { BehaviorSubject, map, Observable, of } from 'rxjs';
import { MAP_SELECTION_INDICATORS_LAYER, MapElement } from '../map-element';
import { EarthPoint, samePosition } from '@trailence/utils/latlng';
import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitive } from '../primitives/primitive';
import { IconPrimitive } from '../primitives/icon';
import { MAP_ANCHOR_RENDER_SIZE } from '../utils/map-anchors';
import { createMapAchorSvgString } from '../utils/map-anchor-svg';

export class AddPointAnchor extends MapElement<undefined> {

  constructor(id: string = 'add-point-anchor', layer: string = MAP_SELECTION_INDICATORS_LAYER) {
    super(id, {layer});
  }

  private readonly _position$ = new BehaviorSubject<EarthPoint | undefined>(undefined);

  public get position() { return this._position$.value; }
  public set position(value: EarthPoint | undefined) {
    if (!value) {
      if (this._position$.value) this._position$.next(undefined);
    } else if (!this._position$.value || !samePosition(value, this._position$.value)) {
      this._position$.next(value);
    }
  }

  public override readonly fitBounds$ = of(undefined);

  protected override createPrimitives$(renderer: MapRenderer): Observable<{ primitive: MapPrimitive<any, MapRenderer, any>; eventBinding: undefined; }[]> {
    let icon: IconPrimitive<MapRenderer, any> | undefined = undefined;
    return this._position$.pipe(
      map(pos => {
        if (!pos) return [];
        if (!icon) {
          icon = renderer.createIcon(this.id, pos, {
            icon: {svgString: createMapAchorSvgString('#FF0000A0', '+', '#FFFFFF', '#FF0000')},
            iconSize: {x: MAP_ANCHOR_RENDER_SIZE, y: MAP_ANCHOR_RENDER_SIZE},
            iconAnchor: 'bottom-center',
          });
        } else {
          icon.setPosition(pos);
        }
        return [{primitive: icon, eventBinding: undefined}];
      }),
    );
  }

}
