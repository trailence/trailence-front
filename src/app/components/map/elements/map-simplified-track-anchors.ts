import { MAP_WAYPOINTS_LAYER, MapElement } from '../map-element';
import { SimplifiedTrackSnapshot } from '@trailence/model/snapshots';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { map, Observable, of } from 'rxjs';
import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitive } from '../primitives/primitive';
import { distance, EarthBBox, EarthPoint } from '@trailence/utils/latlng';
import { MAX_DEPARTURE_ARRIVAL_DISTANCE } from '@trailence/utils/track-waypoints/waypoints-from-track';
import { createAIcon, createDAIcon, createDIcon } from '../utils/map-anchors';

export class MapSimplifiedTrackAnchors extends MapElement<{point: EarthPoint, isDeparture: boolean, isArrival: boolean}> {

  constructor(
    public readonly track: SimplifiedTrackSnapshot,
    private readonly i18n: I18nService,
  ) {
    super('waypoints-' + track.uuid + '#' + track.owner, {layer: MAP_WAYPOINTS_LAYER});
  }

  public override fitBounds$: Observable<EarthBBox | undefined> = of(undefined);

  protected override createPrimitives$(renderer: MapRenderer): Observable<{primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: {point: EarthPoint, isDeparture: boolean, isArrival: boolean}}[]> {
    const departurePoint = this.track.points.at(0);
    if (!departurePoint) return of([]);
    const arrivalPoint = this.track.points.at(-1)!;
    const isDA = distance(departurePoint, arrivalPoint) <= MAX_DEPARTURE_ARRIVAL_DISTANCE;
    return this.i18n.texts$.pipe(
      map(texts => {
        if (isDA) {
          return [{primitive: createDAIcon(this.id + '$DA', renderer, departurePoint, texts), eventBinding: {point: departurePoint, isDeparture: true, isArrival: true}}];
        }
        return [
          {primitive: createDIcon(this.id + '$D', renderer, departurePoint, texts), eventBinding: {point: departurePoint, isDeparture: true, isArrival: false}},
          {primitive: createAIcon(this.id + '$A', renderer, arrivalPoint, texts), eventBinding: {point: arrivalPoint, isDeparture: false, isArrival: true}},
        ];
      })
    );
  }

}
