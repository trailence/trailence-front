import { POI } from '@trailence/services/map/poi';
import { MAP_POIS_LAYER, MapElement } from '../map-element';
import { map, Observable, of } from 'rxjs';
import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitive } from '../primitives/primitive';
import { collectionCache } from '@trailence/utils/rxjs/collection-cache';
import { HtmlMarkerPrimitive } from '../primitives/html-marker';
import { OfflineMapService } from '@trailence/services/map/offline-map.service';
import { IdGenerator } from '@trailence/utils/component-utils';
import { EarthPoint } from '@trailence/utils/latlng';

export class PoisMapElement extends MapElement<POI> {

  constructor(
    id: string,
    public readonly pois$: Observable<POI[]>,
  ) {
    super(id, {layer: MAP_POIS_LAYER});
  }

  public override readonly fitBounds$ = of(undefined);

  protected override createPrimitives$(renderer: MapRenderer): Observable<{primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: POI}[]> {
    return collectionCache(
      this.pois$,
      poi => this.createPoi(renderer, poi),
      (p1, p2) => p1.pos.lat === p2.pos.lat && p1.pos.lng === p2.pos.lng && p1.text === p2.text && p1.type === p2.type,
    );
  }

  private createPoi(renderer: MapRenderer, poi: POI): Observable<{primitive: HtmlMarkerPrimitive<MapRenderer, any>, eventBinding: POI}> {
    return renderer.getInjector().get(OfflineMapService).getPoiIcon$(poi.type).pipe(
      map(icon => ({
        primitive: PoisMapElement.createPoiMarker(
          renderer,
          this.id + '$poi$' + IdGenerator.generateId(),
          icon,
          poi.pos,
          poi.text,
        ),
        eventBinding: poi,
      })),
    );
  }

  public static createPoiMarker(renderer: MapRenderer, id: string, icon: SVGSVGElement, position: EarthPoint, text: string | undefined): HtmlMarkerPrimitive<MapRenderer, any> {
    const container = document.createElement('DIV');
    container.className = 'poi-container';
    container.appendChild(icon);
    if (text) {
      const span = document.createElement('SPAN');
      span.innerText = text;
      container.appendChild(span);
    }
    return renderer.createHtmlMarker(id, position, {
      html: container,
      className: 'poi',
      opacity: 0.75,
      anchorPos: 'left',
    });
  }

}
