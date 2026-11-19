import { EarthPoint, samePosition } from '@trailence/utils/latlng';
import { MAP_SELECTION_INDICATORS_LAYER, MapElement } from '../map-element';
import { BehaviorSubject, debounceTime, map, Observable, of } from 'rxjs';
import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitive } from '../primitives/primitive';
import { IdGenerator } from '@trailence/utils/component-utils';
import { Color } from '@trailence/utils/color';
import { Circle } from '../primitives/circle';

const CURSOR_STROKE_COLOR = Color.parse('#3388ff');
const CURSOR_STROKE_WIDTH = 3;

export class MapCursors extends MapElement<null> {

  constructor(id: string) {
    super(id, {layer: MAP_SELECTION_INDICATORS_LAYER});
  }

  public override readonly fitBounds$ = of(undefined);

  private readonly _cursors$ = new BehaviorSubject<EarthPoint[]>([]);

  public addCursor(position: EarthPoint): void {
    this._cursors$.next([...this._cursors$.value, position]);
  }

  public removeCursor(position: EarthPoint): void {
    const index = this._cursors$.value.findIndex(p => samePosition(p, position));
    if (index >= 0) {
      this._cursors$.value.splice(index, 1);
      this._cursors$.next(this._cursors$.value);
    }
  }

  public removeAll(): void {
    this._cursors$.next([]);
  }

  protected override createPrimitives$(renderer: MapRenderer): Observable<{ primitive: MapPrimitive<any, MapRenderer, any>; eventBinding: null; }[]> {
    let circles: Circle<any, any>[] = [];
    return this._cursors$.pipe(
      debounceTime(1),
      map(positions => {
        let newCircles: Circle<any, any>[] = [];
        for (let i = 0; i < positions.length; ++i) {
          const pos = positions[i];
          if (i < circles.length) {
            const c = circles[i];
            c.setPosition(pos);
            newCircles.push(c);
          } else {
            const c = renderer.createCircle(IdGenerator.generateId(this.id + '$'), pos, {
              radius: 3,
              radiusUnit: 'pixel',
              strokeColor: CURSOR_STROKE_COLOR,
              strokeWidth: CURSOR_STROKE_WIDTH,
              // TODO refacto className cursor ?
            });
            newCircles.push(c);
          }
        }
        circles = newCircles;
        return newCircles.map(primitive => ({primitive, eventBinding: null}));
      })
    );
  }

}
