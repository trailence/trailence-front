import { Track } from '@trailence/model/track';
import { MAP_WAYPOINTS_LAYER, MapElement } from '../map-element';
import { SimplifiedTrackSnapshot } from '@trailence/model/snapshots';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { BehaviorSubject, combineLatest, distinctUntilChanged, map, Observable, of, switchMap } from 'rxjs';
import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitive } from '../primitives/primitive';
import { IconOptions, IconPrimitive } from '../primitives/icon';
import { distance, EarthBBox, EarthPoint, sameOptionalPosition } from '@trailence/utils/latlng';
import { MAX_DEPARTURE_ARRIVAL_DISTANCE } from '@trailence/utils/track-waypoints/waypoints-from-track';
import { createMapAchorSvgString, MAP_ANCHOR_SVG_SIZE } from '../utils/map-anchor';

export const anchorBorderColor = '#d00000';
export const anchorFillColor = '#a00000';
export const anchorTextColor = '#ffffff';

export const anchorDABorderColor = 'rgba(64, 128, 0, 0.75)';
export const anchorDATextColor = anchorTextColor;

export const anchorDepartureBorderColor = 'rgba(0, 128, 0, 0.75)';
export const anchorDepartureFillColor = 'rgb(0, 128, 0)';
export const anchorDepartureTextColor = anchorTextColor;

export const anchorArrivalBorderColor = 'rgba(196, 0, 0, 0.75)';
export const anchorArrivalFillColor = 'rgb(196, 0, 0)';
export const anchorArrivalTextColor = anchorTextColor;

export const anchorBreakBorderColor = '#b0865cD8';
export const anchorBreakFillColor = '#C8986890';
export const anchorBreakTextColor = '#ffffff';

export class MapTrackAnchors extends MapElement<MapTrackAnchors> {

  constructor(
    public readonly track: Track | SimplifiedTrackSnapshot,
    private readonly i18n: I18nService,
    neverShowArrival: boolean = false,
    showDepartueAndArrival: boolean = false,
    showWayPoints: boolean = false,
    showBreaks: boolean = false,
  ) {
    super('waypoints-' + track.uuid + '#' + track.owner, {layer: MAP_WAYPOINTS_LAYER});
    this._neverShowArrival = new BehaviorSubject(neverShowArrival);
    this._showDepartureAndArrivals = new BehaviorSubject(showDepartueAndArrival);
    this._showWayPoints = new BehaviorSubject(track instanceof Track ? showWayPoints : false);
    this._showBreaks = new BehaviorSubject(track instanceof Track ? showBreaks : false);
  }

  private readonly _neverShowArrival: BehaviorSubject<boolean>; // in case of recording
  private readonly _showDepartureAndArrivals: BehaviorSubject<boolean>;
  private readonly _showWayPoints: BehaviorSubject<boolean>;
  private readonly _showBreaks: BehaviorSubject<boolean>;

  public override fitBounds$: Observable<EarthBBox | undefined> = of(undefined);

  protected override createPrimitives$(renderer: MapRenderer): Observable<MapPrimitive<any, MapRenderer>[]> {
    return combineLatest([
      this.createDA(renderer),
      this.createWayPoints(renderer),
      this.createBreaks(renderer),
    ]).pipe(map(elements => elements.flat()));
  }

  private createDA(renderer: MapRenderer): Observable<IconPrimitive<MapRenderer>[]> {
    let d: IconPrimitive<MapRenderer> | undefined;
    let a: IconPrimitive<MapRenderer> | undefined;
    let da: IconPrimitive<MapRenderer> | undefined;
    let texts: any;
    return this._showDepartureAndArrivals.pipe(
      switchMap(show => {
        if (!show) return of([]);
        const departure$ = this.track instanceof Track ? this.getDeparture$(this.track) : of(this.track.points.at(0));
        const arrival$ = this._neverShowArrival.pipe(
          switchMap(hideArrival => {
            if (hideArrival) return of(undefined);
            return this.track instanceof Track ? this.getArrival$(this.track) : of(this.track.points.at(-1));
          })
        );
        return combineLatest([
          departure$,
          arrival$,
          this.i18n.texts$,
        ]).pipe(
          map(([departurePoint, arrivalPoint, i18nTexts]) => {
            if (!departurePoint) {
              d = a = da = undefined;
              return [];
            }
            if (arrivalPoint && distance(departurePoint, arrivalPoint) <= MAX_DEPARTURE_ARRIVAL_DISTANCE) {
              // DA
              d = a = undefined;
              if (da) {
                da.setPosition(departurePoint);
                if (texts !== i18nTexts) {
                  da.setOptions(this.getDAIconOptions(i18nTexts));
                  texts = i18nTexts;
                }
              } else {
                da = this.createDAIcon(renderer, departurePoint, i18nTexts);
                texts = i18nTexts;
              }
              return [da];
            }
            da = undefined;
            if (d) {
              d.setPosition(departurePoint);
              if (texts !== i18nTexts) {
                d.setOptions(this.getDIconOptions(i18nTexts));
              }
            } else {
              d = this.createDIcon(renderer, departurePoint, i18nTexts);
            }
            if (arrivalPoint) {
              if (a) {
                a.setPosition(arrivalPoint);
                if (texts !== i18nTexts) {
                  a.setOptions(this.getAIconOptions(i18nTexts));
                }
              } else {
                a = this.createAIcon(renderer, arrivalPoint, i18nTexts);
              }
            } else {
              a = undefined;
            }
            texts = i18nTexts;
            return a ? [d, a] : [d];
          }),
        )
      }),
    );
  }

  private getDeparture$(track: Track): Observable<EarthPoint | undefined> {
    return track.segments$.pipe(
      switchMap(segments => {
        const segment = segments.at(0);
        if (!segment) return of(undefined);
        return segment.pointsWithChanges$.pipe(
          map(points => points.at(0)?.pos),
        );
      }),
      distinctUntilChanged(sameOptionalPosition),
    );
  }

  private getArrival$(track: Track): Observable<EarthPoint | undefined> {
    return track.segments$.pipe(
      switchMap(segments => {
        const segment = segments.at(-1);
        if (!segment) return of(undefined);
        return segment.pointsWithChanges$.pipe(
          map(points => points.at(-1)?.pos),
        );
      }),
      distinctUntilChanged(sameOptionalPosition),
    );
  }

  private createDAIcon(renderer: MapRenderer, position: EarthPoint, texts: any): IconPrimitive<MapRenderer> {
    return renderer.createIcon(this.id + '$DA', position, this.getDAIconOptions(texts));
  }
  private getDAIconOptions(texts: any): IconOptions {
    return {
      icon: createMapAchorSvgString(anchorDABorderColor, texts.way_points.DA, anchorDATextColor, anchorDepartureFillColor, anchorArrivalFillColor),
      iconOriginalSize: {x: MAP_ANCHOR_SVG_SIZE, y: MAP_ANCHOR_SVG_SIZE},
      iconRenderSize: {x: 40, y: 40},
      iconAnchor: 'bottom-center',
      rotateOnMouseOver: true,
    };
  }

  private createDIcon(renderer: MapRenderer, position: EarthPoint, texts: any): IconPrimitive<MapRenderer> {
    return renderer.createIcon(this.id + '$D', position, this.getDIconOptions(texts));
  }
  private getDIconOptions(texts: any): IconOptions {
    return {
      icon: createMapAchorSvgString(anchorDepartureBorderColor, texts.way_points.D, anchorDepartureTextColor, anchorDepartureFillColor),
      iconOriginalSize: {x: MAP_ANCHOR_SVG_SIZE, y: MAP_ANCHOR_SVG_SIZE},
      iconRenderSize: {x: 40, y: 40},
      iconAnchor: 'bottom-center',
      rotateOnMouseOver: true,
    };
  }

  private createAIcon(renderer: MapRenderer, position: EarthPoint, texts: any): IconPrimitive<MapRenderer> {
    return renderer.createIcon(this.id + '$A', position, this.getAIconOptions(texts));
  }
  private getAIconOptions(texts: any): IconOptions {
    return {
      icon: createMapAchorSvgString(anchorArrivalBorderColor, texts.way_points.A, anchorArrivalTextColor, anchorArrivalFillColor),
      iconOriginalSize: {x: MAP_ANCHOR_SVG_SIZE, y: MAP_ANCHOR_SVG_SIZE},
      iconRenderSize: {x: 40, y: 40},
      iconAnchor: 'bottom-center',
      rotateOnMouseOver: true,
    };
  }

  private createWayPoints(renderer: MapRenderer): Observable<IconPrimitive<MapRenderer>[]> {
    return of([]); // TODO
  }

  private createBreaks(renderer: MapRenderer): Observable<IconPrimitive<MapRenderer>[]> {
    return of([]); // TODO
  }

}
