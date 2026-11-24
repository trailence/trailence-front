import { map, Observable, of, switchMap } from 'rxjs';
import { MAP_WAYS_LAYER, MapElement } from '../map-element';
import { Color } from '@trailence/utils/color';
import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitive } from '../primitives/primitive';
import { EarthPoint } from '@trailence/utils/latlng';
import { MapLayersService } from '@trailence/services/map/map-layers.service';

const WAY_DASH = [4, 2];

export enum WaysColor {
  NORMAL = 'default',
  PERMISSIVE = 'permissive',
  FORBIDDEN = 'forbidden',
}

export class WaysMapElement extends MapElement<null> {

  constructor(
    id: string,
    public readonly ways$: Observable<{points: EarthPoint[]}[]>,
    public readonly color: WaysColor,
    public readonly opacity: number,
    public readonly width: number = 3,
  ) {
    super(id, {layer: MAP_WAYS_LAYER});
  }

  public override readonly fitBounds$ = of(undefined);

  protected override createPrimitives$(renderer: MapRenderer): Observable<{primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: null}[]> {
    return renderer.getInjector().get(MapLayersService).darkMapEnabled$.pipe(
      switchMap(() => this.ways$),
      map(ways => {
        if (ways.length === 0) return [];
        const positions: EarthPoint[][] = ways.map(way => way.points);
        const color = Color.fromCssVariable('--way-' + this.color + '-color', document.body).setAlpha(this.opacity);
        const dashArray = this.color === WaysColor.NORMAL ? undefined : WAY_DASH;
        return [{primitive: renderer.createPolyline(this.id, positions, {
          color,
          width: this.width,
          dashArray,
        }), eventBinding: null}];
      })
    );
  }

}
