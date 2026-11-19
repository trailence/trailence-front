import { Track } from '@trailence/model/track';
import { MAP_WAYPOINTS_LAYER, MapElement } from '../map-element';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { BehaviorSubject, combineLatest, debounceTime, map, Observable, of, switchMap } from 'rxjs';
import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitive } from '../primitives/primitive';
import { IconPrimitive } from '../primitives/icon';
import { EarthBBox, EarthPoint, samePosition } from '@trailence/utils/latlng';
import { WayPointFromTrack } from '@trailence/utils/track-waypoints/waypoints-from-track';
import { TrackWayPoint } from '@trailence/utils/track-waypoints/track-waypoint';
import { createAIcon, createBreakPointIcon, createDAIcon, createDIcon, createWPIcon, getAIconOptions, getDAIconOptions, getDIconOptions, MAP_ANCHOR_RENDER_SIZE } from '../utils/map-anchors';
import { Color } from '@trailence/utils/color';
import { BreakPoint } from '@trailence/utils/track-waypoints/breakpoints';
import { Arrays } from '@trailence/utils/arrays';
import { IdGenerator } from '@trailence/utils/component-utils';
import { OfflineMapService } from '@trailence/services/map/offline-map.service';
import { HtmlMarkerPrimitive } from '../primitives/html-marker';
import { GuidepostWayPoint } from '@trailence/utils/track-waypoints/guideposts';
import { PoisMapElement } from './pois';

export class MapTrackAnchors extends MapElement<TrackWayPoint> {

  constructor(
    public readonly track: Track,
    private readonly i18n: I18nService,
    neverShowArrival: boolean = false,
    showDepartueAndArrival: boolean = false,
    showWayPoints: Color | undefined = undefined,
    showBreaks: Color | undefined = undefined,
    showGuideposts: boolean = false,
  ) {
    super('waypoints-' + track.uuid + '#' + track.owner, {layer: MAP_WAYPOINTS_LAYER});
    this._neverShowArrival = new BehaviorSubject(neverShowArrival);
    this._showDepartureAndArrivals = new BehaviorSubject(showDepartueAndArrival);
    this._showWayPoints = new BehaviorSubject(showWayPoints);
    this._showBreaks = new BehaviorSubject(showBreaks);
    this._showGuideposts = new BehaviorSubject(showGuideposts);
  }

  private readonly _neverShowArrival: BehaviorSubject<boolean>; // in case of recording
  private readonly _showDepartureAndArrivals: BehaviorSubject<boolean>;
  private readonly _showWayPoints: BehaviorSubject<Color | undefined>;
  private readonly _showBreaks: BehaviorSubject<Color | undefined>;
  private readonly _showGuideposts: BehaviorSubject<boolean>;
  private readonly _highlighted = new BehaviorSubject<TrackWayPoint[]>([]);

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

  public get showGuideposts(): boolean { return this._showGuideposts.value; }
  public get showGuideposts$(): Observable<boolean> { return this._showGuideposts; }
  public set showGuideposts(value: boolean) {
    if (value !== this._showGuideposts.value)
      this._showGuideposts.next(value);
  }

  public highlightWayPoint(wp: TrackWayPoint) {
    if (this._highlighted.value.includes(wp)) return;
    this._highlighted.value.push(wp);
    this._highlighted.next(this._highlighted.value);
  }
  public unhighlightWayPoint(wp: TrackWayPoint) {
    const index = this._highlighted.value.indexOf(wp);
    if (index < 0) return;
    this._highlighted.value.splice(index, 1);
    this._highlighted.next(this._highlighted.value);
  }

  public static breakPointText(breakPoint: BreakPoint): string {
    return breakPoint.isBreak ? '&#8987;' : breakPoint.isPause ? '&#x23F8;' : breakPoint.isResume ? '&#x23F5;' : '&#x23EF;';
  }

  protected override createPrimitives$(renderer: MapRenderer): Observable<{primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: TrackWayPoint}[]> {
    const da = new DA();
    const wp = new WayPoints();
    const breaks = new Breaks();
    const guideposts = new Guideposts();
    return combineLatest([
      this._showDepartureAndArrivals,
      this._showWayPoints,
      this._showBreaks,
      this._showGuideposts.pipe(
        switchMap(show => {
          if (!show) return of(undefined);
          return renderer.getInjector().get(OfflineMapService).getPoiIcon$('guidepost');
        })
      ),
    ]).pipe(
      switchMap(([showDA, showWP, showBreaks, guidepostIcon]) => {
        if (!showDA && !showWP && !showBreaks && !guidepostIcon) return of([]);
        return combineLatest([
          this.track.computed.wayPoints$.pipe(
            switchMap(waypoints => {
              return this._highlighted.pipe(
                debounceTime(1),
                map(highlighted => [waypoints, highlighted])
              );
            })
          ),
          showDA ? this._neverShowArrival : of(false),
          showDA ? this.i18n.texts$ : of({}),
        ]).pipe(
          map(([[waypoints, highlighted], hideArrival, texts]) => {
            const icons: {primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: TrackWayPoint}[] = [];
            da.update(this.id, renderer, waypoints, highlighted, showDA, hideArrival, texts, icons);
            wp.update(this.id, renderer, waypoints, highlighted, showWP, icons);
            breaks.update(this.id, renderer, waypoints, highlighted, showBreaks, icons);
            guideposts.update(this.id, renderer, waypoints, highlighted, guidepostIcon, icons);
            if (highlighted.length > 0) {
              const toAppend: {primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: TrackWayPoint}[] = [];
              for (const h of highlighted) {
                const index = icons.findIndex(i => i.primitive.data === h);
                if (index >= 0) {
                  toAppend.push(icons.splice(index, 1)[0]);
                }
              }
              icons.push(...toAppend);
            }
            return icons;
          })
        );
      })
    );
  }

}

function applyIconOptions(icon: IconPrimitive<MapRenderer, any>, wp: TrackWayPoint, highlighted: TrackWayPoint[]) {
  const opacity = highlighted.length === 0 || highlighted.includes(wp) ? 1 : 0.5;
  const size = highlighted.includes(wp) ? Math.floor(MAP_ANCHOR_RENDER_SIZE * 1.2) : MAP_ANCHOR_RENDER_SIZE;
  const options = icon.getOptions();
  options.opacity = opacity;
  options.iconRenderSize = {x: size, y: size};
  icon.setOptions(options);
  icon.data = wp;
}

class DA {
  private d?: IconPrimitive<MapRenderer, any>;
  private a?: IconPrimitive<MapRenderer, any>;
  private da?: IconPrimitive<MapRenderer, any>;
  private texts: any = {};

  update(id: string, renderer: MapRenderer, waypoints: TrackWayPoint[], highlighted: TrackWayPoint[], showDA: boolean, hideArrival: boolean, texts: any, icons: {primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: TrackWayPoint}[]): void {
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
              this.da = createDAIcon(id + '$DA', renderer, wpt.getPosition(), texts);
            }
            applyIconOptions(this.da, wp, highlighted);
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
              this.d = createDIcon(id + '$D', renderer, wpt.getPosition(), texts);
            }
            applyIconOptions(this.d, wp, highlighted);
            icons.push({primitive: this.d, eventBinding: wp});
          }
        } else if (wpt.isArrival && !arrivalFound) {
          arrivalFound = true;
          if (this.a) {
            this.a.setPosition(wpt.getPosition());
            if (texts !== this.texts) this.a.setOptions(getAIconOptions(texts));
          } else {
            this.a = createAIcon(id + '$A', renderer, wpt.getPosition(), texts);
          }
          applyIconOptions(this.a, wp, highlighted);
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

  update(id: string, renderer: MapRenderer, waypoints: TrackWayPoint[], highlighted: TrackWayPoint[], showWP: Color | undefined, icons: {primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: TrackWayPoint}[]): void {
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
        applyIconOptions(icon.icon, wp, highlighted);
        newIcons.push(icon);
        icons.push({primitive: icon.icon, eventBinding: wp});
      } else {
        const icon = createWPIcon(id + '$WP$' + twp.index, renderer, position, twp.index, showWP);
        applyIconOptions(icon, wp, highlighted);
        newIcons.push({icon, color: showWP.copy(), index: twp.index, position});
        icons.push({primitive: icon, eventBinding: wp});
      }
    }
    this.icons = newIcons;
  }

}

class Breaks {
  private icons: {icon: IconPrimitive<MapRenderer, any>, color: Color, text: string, position: EarthPoint}[] = [];

  update(id: string, renderer: MapRenderer, waypoints: TrackWayPoint[], highlighted: TrackWayPoint[], showBreaks: Color | undefined, icons: {primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: TrackWayPoint}[]): void {
    if (!showBreaks) {
      this.icons = [];
      return;
    }
    let newIcons: {icon: IconPrimitive<MapRenderer, any>, color: Color, text: string, position: EarthPoint}[] = [];
    for (const wp of waypoints) {
      const bp = BreakPoint.from(wp);
      if (!bp) continue;
      const position = bp.getPosition();
      const text = bp.isBreak ? '&#8987;' : bp.isPause ? '&#x23F8;' : bp.isResume ? '&#x23F5;' : '&#x23EF;'
      const existing = Arrays.removeFirstMatching(this.icons, icon => icon.text === text && Color.areSame(showBreaks, icon.color));
      if (existing) {
        const icon = existing.element;
        if (!samePosition(icon.position, position)) {
          icon.icon.setPosition(position)
          icon.position = position;
        }
        applyIconOptions(icon.icon, wp, highlighted);
        newIcons.push(icon);
        icons.push({primitive: icon.icon, eventBinding: wp});
      } else {
        const icon = createBreakPointIcon(IdGenerator.generateId(id + '$BP$'), renderer, position, showBreaks, text);
        applyIconOptions(icon, wp, highlighted);
        newIcons.push({icon, color: showBreaks.copy(), text, position});
        icons.push({primitive: icon, eventBinding: wp});
      }
    }
    this.icons = newIcons;
  }
}

function applyMarkerOptions(marker: HtmlMarkerPrimitive<MapRenderer, any>, wp: TrackWayPoint, highlighted: TrackWayPoint[]) {
  const opacity = highlighted.length === 0 || highlighted.includes(wp) ? 1 : 0.5;
  const options = marker.getOptions();
  options.opacity = opacity;
  marker.setOptions(options);
  marker.data = wp;
}

class Guideposts {
  private markers: {marker: HtmlMarkerPrimitive<MapRenderer, any>, text: string, position: EarthPoint}[] = [];

  update(id: string, renderer: MapRenderer, waypoints: TrackWayPoint[], highlighted: TrackWayPoint[], svg: SVGSVGElement | undefined, icons: {primitive: MapPrimitive<any, MapRenderer, any>, eventBinding: TrackWayPoint}[]): void {
    if (!svg) {
      this.markers = [];
      return;
    }
    let newMarkers: {marker: HtmlMarkerPrimitive<MapRenderer, any>, text: string, position: EarthPoint}[] = [];
    for (const wp of waypoints) {
      const gp = GuidepostWayPoint.from(wp);
      if (!gp) continue;
      const position = gp.getPosition();
      const text = gp.getText();
      const existing = Arrays.removeFirstMatching(this.markers, marker => marker.text === text);
      if (existing) {
        const marker = existing.element;
        if (!samePosition(marker.position, position)) {
          marker.marker.setPosition(position)
          marker.position = position;
        }
        applyMarkerOptions(marker.marker, wp, highlighted);
        newMarkers.push(marker);
        icons.push({primitive: marker.marker, eventBinding: wp});
      } else {
        const marker = PoisMapElement.createPoiMarker(renderer, IdGenerator.generateId(id + '$guidepost$'), svg.cloneNode(true) as SVGSVGElement, position, text);
        applyMarkerOptions(marker, wp, highlighted);
        newMarkers.push({marker, text, position});
        icons.push({primitive: marker, eventBinding: wp});
      }
    }
    this.markers = newMarkers;
  }
}
