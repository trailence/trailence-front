import { Track } from '@trailence/model/track';
import { MAP_WAYPOINTS_LAYER, MapElement } from '../map-element';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { BehaviorSubject, combineLatest, map, Observable, of, switchMap } from 'rxjs';
import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitive } from '../primitives/primitive';
import { IconPrimitive } from '../primitives/icon';
import { EarthBBox } from '@trailence/utils/latlng';
import { WayPointFromTrack } from '@trailence/utils/track-waypoints/waypoints-from-track';
import { TrackWayPoint } from '@trailence/utils/track-waypoints/track-waypoint';
import { createAIcon, createDAIcon, createDIcon, getAIconOptions, getDAIconOptions, getDIconOptions } from '../utils/map-anchors';

export class MapTrackAnchors extends MapElement<TrackWayPoint> {

  constructor(
    public readonly track: Track,
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

  protected override createPrimitives$(renderer: MapRenderer): Observable<{primitive: MapPrimitive<any, MapRenderer>, eventBinding: TrackWayPoint}[]> {
    let da: DA = {texts: {}};
    return combineLatest([
      this._showDepartureAndArrivals,
      this._showWayPoints,
      this._showBreaks,
    ]).pipe(
      switchMap(([showDA, showWP, showBreaks]) => {
        if (!showDA && !showWP && !showBreaks) return of([]);
        return combineLatest([
          this.track.computed.wayPoints$,
          showDA ? this._neverShowArrival : of(false),
          showDA ? this.i18n.texts$ : of({}),
        ]).pipe(
          map(([waypoints, hideArrival, texts]) => {
            const icons: {primitive: MapPrimitive<any, MapRenderer>, eventBinding: TrackWayPoint}[] = [];
            this.updateDA(renderer, waypoints, showDA, hideArrival, texts, da, icons);
            // TODO waypoints
            // TODO breaks
            return icons;
          })
        );
      })
    );
  }

  private updateDA(renderer: MapRenderer, waypoints: TrackWayPoint[], showDA: boolean, hideArrival: boolean, texts: any, current: DA, icons: {primitive: MapPrimitive<any, MapRenderer>, eventBinding: TrackWayPoint}[]): void {
    if (!showDA) {
      current.d = current.a = current.da = undefined;
      return;
    }
    let departureFound = false;
    let arrivalFound = false;
    for (const wp of waypoints) {
      const wpt = WayPointFromTrack.from(wp);
      if (wpt) {
        if (wpt.isDeparture) {
          if (wpt.isArrival && !hideArrival) {
            current.d = current.a = undefined;
            if (current.da) {
              current.da.setPosition(wpt.getPosition());
              if (texts !== current.texts) current.da.setOptions(getDAIconOptions(texts));
            } else {
              current.da = createDAIcon(this.id, renderer, wpt.getPosition(), texts);
            }
            current.texts = texts;
            icons.push({primitive: current.da, eventBinding: wp});
            return;
          }
          if (!departureFound) {
            departureFound = true;
            if (current.d) {
              current.d.setPosition(wpt.getPosition());
              if (texts !== current.texts) current.d.setOptions(getDIconOptions(texts));
            } else {
              current.d = createDIcon(this.id, renderer, wpt.getPosition(), texts);
            }
            icons.push({primitive: current.d, eventBinding: wp});
          }
        } else if (wpt.isArrival && !arrivalFound) {
          arrivalFound = true;
          if (current.a) {
            current.a.setPosition(wpt.getPosition());
            if (texts !== current.texts) current.a.setOptions(getAIconOptions(texts));
          } else {
            current.a = createAIcon(this.id, renderer, wpt.getPosition(), texts);
          }
          icons.push({primitive: current.a, eventBinding: wp});
        }
      }
    }
    current.texts = texts;
    current.da = undefined;
    if (!departureFound) current.d = undefined;
    if (!arrivalFound) current.a = undefined;
  }

}

interface DA {
  d?: IconPrimitive<MapRenderer>;
  a?: IconPrimitive<MapRenderer>;
  da?: IconPrimitive<MapRenderer>;
  texts: any;
}
