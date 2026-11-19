import { Observable, of } from 'rxjs';
import { MapRenderer } from '../impl/map-renderer';
import { MapElement } from '../map-element';
import { MapPrimitive } from '../primitives/primitive';

export class MapTrackMarkedTrails extends MapElement<any> {

  public override readonly fitBounds$ = of(undefined);

  protected override createPrimitives$(renderer: MapRenderer): Observable<{ primitive: MapPrimitive<any, MapRenderer, any>; eventBinding: any; }[]> {
    return of([]); // TODO
  }

}
