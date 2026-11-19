import { Track } from '@trailence/model/track';
import { MAP_WAYPOINTS_LAYER, MapElement } from '../map-element';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { BehaviorSubject, combineLatest, map, Observable, of, switchMap } from 'rxjs';
import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitive } from '../primitives/primitive';
import { IconPrimitive } from '../primitives/icon';
import { EarthBBox, EarthPoint, samePosition } from '@trailence/utils/latlng';
import { WayPointFromTrack } from '@trailence/utils/track-waypoints/waypoints-from-track';
import { TrackWayPoint } from '@trailence/utils/track-waypoints/track-waypoint';
import { createAIcon, createDAIcon, createDIcon, createWPIcon, getAIconOptions, getDAIconOptions, getDIconOptions } from '../utils/map-anchors';
import { Color } from '@trailence/utils/color';
import { BreakPoint } from '@trailence/utils/track-waypoints/breakpoints';
import { Arrays } from '@trailence/utils/arrays';

export class MapTrackAnchors extends MapElement<TrackWayPoint> {

  constructor(
    public readonly track: Track,
    private readonly i18n: I18nService,
    neverShowArrival: boolean = false,
    showDepartueAndArrival: boolean = false,
    showWayPoints: Color | undefined = undefined,
    showBreaks: Color | undefined = undefined,
  ) {
    super('waypoints-' + track.uuid + '#' + track.owner, {layer: MAP_WAYPOINTS_LAYER});
    this._neverShowArrival = new BehaviorSubject(neverShowArrival);
    this._showDepartureAndArrivals = new BehaviorSubject(showDepartueAndArrival);
    this._showWayPoints = new BehaviorSubject(track instanceof Track ? showWayPoints : undefined);
    this._showBreaks = new BehaviorSubject(track instanceof Track ? showBreaks : undefined);
  }

  private readonly _neverShowArrival: BehaviorSubject<boolean>; // in case of recording
  private readonly _showDepartureAndArrivals: BehaviorSubject<boolean>;
  private readonly _showWayPoints: BehaviorSubject<Color | undefined>;
  private readonly _showBreaks: BehaviorSubject<Color | undefined>;

  public override fitBounds$: Observable<EarthBBox | undefined> = of(undefined);

  public get showWayPoints(): Color | undefined { return this._showWayPoints.value; }
  public get showWayPoints$(): Observable<Color | undefined> { return this._showWayPoints; }
  public set showWayPoints(value: Color | undefined) {
    if (value) {
      if (!this._showWayPoints.value || !Color.areSame(this._showWayPoints.value, value))
        this._showWayPoints.next(value);
    } else if (this._showWayPoints.value) {
      this._showWayPoints.next(undefined);
    }
  }

  public get showBreaks(): Color | undefined { return this._showBreaks.value; }
  public get showBreaks$(): Observable<Color | undefined> { return this._showBreaks; }
  public set showBreaks(value: Color | undefined) {
    if (value) {
      if (!this._showBreaks.value || !Color.areSame(this._showBreaks.value, value))
        this._showBreaks.next(value);
    } else if (this._showBreaks.value) {
      this._showBreaks.next(undefined);
    }
  }

  public static breakPointText(breakPoint: BreakPoint): string {
    return breakPoint.isBreak ? '&#8987;' : breakPoint.isPause ? '&#x23F8;' : breakPoint.isResume ? '&#x23F5;' : '&#x23EF;';
  }

  protected override createPrimitives$(renderer: MapRenderer): Observable<{primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: TrackWayPoint}[]> {
    const da = new DA();
    const wp = new WayPoints();
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
            const icons: {primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: TrackWayPoint}[] = [];
            da.update(this.id, renderer, waypoints, showDA, hideArrival, texts, icons);
            wp.update(this.id, renderer, waypoints, showWP, icons);
            // TODO breaks
            return icons;
          })
        );
      })
    );
  }

}

class DA {
  private d?: IconPrimitive<MapRenderer, any>;
  private a?: IconPrimitive<MapRenderer, any>;
  private da?: IconPrimitive<MapRenderer, any>;
  private texts: any = {};

  update(id: string, renderer: MapRenderer, waypoints: TrackWayPoint[], showDA: boolean, hideArrival: boolean, texts: any, icons: {primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: TrackWayPoint}[]): void {
    if (!showDA) {
      this.d = this.a = this.da = undefined;
      return;
    }
    let departureFound = false;
    let arrivalFound = false;
    for (const wp of waypoints) {
      const wpt = WayPointFromTrack.from(wp);
      if (wpt) {
        if (wpt.isDeparture) {
          if (wpt.isArrival && !hideArrival) {
            this.d = this.a = undefined;
            if (this.da) {
              this.da.setPosition(wpt.getPosition());
              if (texts !== this.texts) this.da.setOptions(getDAIconOptions(texts));
            } else {
              this.da = createDAIcon(id, renderer, wpt.getPosition(), texts);
            }
            this.texts = texts;
            icons.push({primitive: this.da, eventBinding: wp});
            return;
          }
          if (!departureFound) {
            departureFound = true;
            if (this.d) {
              this.d.setPosition(wpt.getPosition());
              if (texts !== this.texts) this.d.setOptions(getDIconOptions(texts));
            } else {
              this.d = createDIcon(id, renderer, wpt.getPosition(), texts);
            }
            icons.push({primitive: this.d, eventBinding: wp});
          }
        } else if (wpt.isArrival && !arrivalFound) {
          arrivalFound = true;
          if (this.a) {
            this.a.setPosition(wpt.getPosition());
            if (texts !== this.texts) this.a.setOptions(getAIconOptions(texts));
          } else {
            this.a = createAIcon(id, renderer, wpt.getPosition(), texts);
          }
          icons.push({primitive: this.a, eventBinding: wp});
        }
      }
    }
    this.texts = texts;
    this.da = undefined;
    if (!departureFound) this.d = undefined;
    if (!arrivalFound) this.a = undefined;
  }

}

class WayPoints {
  private icons: {icon: IconPrimitive<MapRenderer, any>, color: Color, index: number, position: EarthPoint}[] = [];

  update(id: string, renderer: MapRenderer, waypoints: TrackWayPoint[], showWP: Color | undefined, icons: {primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: TrackWayPoint}[]): void {
    if (!showWP) {
      this.icons = [];
      return;
    }
    let newIcons: {icon: IconPrimitive<MapRenderer, any>, color: Color, index: number, position: EarthPoint}[] = [];
    for (const wp of waypoints) {
      const twp = WayPointFromTrack.from(wp);
      if (!twp || twp.isDeparture || twp.isArrival || twp.isComputedOnly) continue;
      const position = twp.getPosition();
      const existing = Arrays.removeFirstMatching(this.icons, icon => icon.index === twp.index && Color.areSame(showWP, icon.color));
      if (existing) {
        const icon = existing.element;
        if (!samePosition(icon.position, position)) {
          icon.icon.setPosition(position)
          icon.position = position;
        }
        newIcons.push(icon);
        icons.push({primitive: icon.icon, eventBinding: wp});
      } else {
        const icon = createWPIcon(id, renderer, position, twp.index, showWP);
        newIcons.push({icon, color: showWP.copy(), index: twp.index, position});
        icons.push({primitive: icon, eventBinding: wp});
      }
    }
    this.icons = newIcons;
  }

}
