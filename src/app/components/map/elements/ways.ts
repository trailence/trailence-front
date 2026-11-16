import { map, Observable, of } from 'rxjs';
import { MAP_WAYS_LAYER, MapElement } from '../map-element';
import { Way } from '@trailence/services/map/way';
import { Color } from '@trailence/utils/color';
import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitive } from '../primitives/primitive';
import { EarthPoint } from '@trailence/utils/latlng';

export class WaysMapElement extends MapElement<WaysMapElement> {

  constructor(
    id: string,
    public readonly ways$: Observable<Way[]>,
    public readonly color: Color,
    public readonly width: number = 3,
    public readonly dashArray?: number[],
  ) {
    super(id, {layer: MAP_WAYS_LAYER});
  }

  public override readonly fitBounds$ = of(undefined);

  protected override createPrimitives$(renderer: MapRenderer): Observable<MapPrimitive<any, MapRenderer>[]> {
    return this.ways$.pipe(
      map(ways => {
        const positions: EarthPoint[][] = ways.map(way => way.points);
        return [renderer.createPolyline(this.id, positions, {
          color: this.color,
          width: this.width,
          dashArray: this.dashArray,
        })];
      })
    );
  }

}
