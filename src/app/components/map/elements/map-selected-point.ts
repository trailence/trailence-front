import { EarthPoint, sameOptionalPosition } from '@trailence/utils/latlng';
import { BehaviorSubject, distinctUntilChanged, map, Observable, of } from 'rxjs';
import { MAP_SELECTION_INDICATORS_LAYER, MapElement } from '../map-element';
import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitive } from '../primitives/primitive';
import { createSelectedPointAnchorIcon } from '../utils/map-anchors';
import { IconPrimitive } from '../primitives/icon';

export class MapSelectedPoint extends MapElement<null> {

  constructor(id: string) {
    super(id, {layer: MAP_SELECTION_INDICATORS_LAYER});
  }

  public override readonly fitBounds$ = of(undefined);

  public readonly selection$ = new BehaviorSubject<EarthPoint | undefined>(undefined);

  protected override createPrimitives$(renderer: MapRenderer): Observable<{ primitive: MapPrimitive<any, MapRenderer, any>; eventBinding: null; }[]> {
    let anchor: IconPrimitive<MapRenderer, any> | undefined = undefined;
    return this.selection$.pipe(
      distinctUntilChanged(sameOptionalPosition),
      map(position => {
        if (position) {
          if (anchor) anchor.setPosition(position);
          else anchor = createSelectedPointAnchorIcon(this.id, renderer, position);
          return [{primitive: anchor, eventBinding: null}];
        } else {
          if (anchor) anchor = undefined;
          return [];
        }
      }),
    );
  }

}
