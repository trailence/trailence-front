import { Track } from 'src/app/model/track';
import { MapAnchor } from '../markers/map-anchor';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { combineLatest, Subscription } from 'rxjs';
import * as L from 'leaflet';
import { Color } from 'src/app/utils/color';
import { SimplifiedTrackSnapshot } from 'src/app/model/snapshots';
import { TrackWayPoint } from 'src/app/utils/track-waypoints/track-waypoint';
import { WayPointFromTrack } from 'src/app/utils/track-waypoints/waypoints-from-track';
import { BreakPoint } from 'src/app/utils/track-waypoints/breakpoints';
import { GuidepostWayPoint } from 'src/app/utils/track-waypoints/guideposts';

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

export type ShowBreaksStyle = 'colored' | 'normal' | undefined;

export class MapTrackWayPoints {

  private _wayPointsAnchors?: MapAnchor[];
  private _guidepostsTooltips?: L.Tooltip[];
  private _breaks?: MapAnchor[];
  private _breaksColored?: MapAnchor[];
  private _departure?: MapAnchor;
  private _arrival?: MapAnchor;
  private _departureAndArrival?: MapAnchor;

  private _showDA = false;
  private _showWP = false;
  private _showBreaks: ShowBreaksStyle = undefined;
  private _showGuideposts = false;
  private _map?: L.Map;
  private subscription?: Subscription;

  constructor(
    private readonly track: Track | SimplifiedTrackSnapshot,
    private readonly _isRecording: boolean,
    private readonly getColor: () => string,
    private readonly i18n: I18nService,
  ) {}

  public addTo(map: L.Map): void {
    if (this._map) return;
    this._map = map;
    if (this._showDA) this.addDAToMap();
    if (this._showBreaks) this.addBreaksToMap(this._showBreaks);
    if (this._showWP) this.addWPToMap();
    if (this._showGuideposts) this.addGuidepostsToMap();
  }

  public remove(): void {
    if (!this._map) return;
    if (this._showDA) this.removeDAFromMap();
    if (this._showBreaks) this.removeBreaksFromMap();
    if (this._showWP) this.removeWPFromMap();
    if (this._showGuideposts) this.removeGuidepostsFromMap();
    this._map = undefined;
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }

  public reset(): void {
    if (!this._map) return;
    const map = this._map;
    this.remove();
    this._wayPointsAnchors = undefined;
    this._guidepostsTooltips = undefined;
    this._breaks = undefined;
    this._breaksColored = undefined;
    this._departure = undefined;
    this._arrival = undefined;
    this._departureAndArrival = undefined;
    this.addTo(map);
  }

  public showDepartureAndArrival(show: boolean): void {
    if (this._showDA === show) return;
    this._showDA = show;
    if (this._map) {
      if (show) this.addDAToMap(); else this.removeDAFromMap();
    }
  }

  public showWayPoints(show: boolean): void {
    if (show === this._showWP) return;
    this._showWP = show;
    if (this._map) {
      if (show) this.addWPToMap(); else this.removeWPFromMap();
    }
  }

  public showBreaks(style: ShowBreaksStyle): void {
    if (style === this._showBreaks) return;
    this._showBreaks = style;
    if (this._map) {
      if (style) this.addBreaksToMap(style); else this.removeBreaksFromMap();
    }
  }

  public showGuideposts(shown: boolean): void {
    if (shown === this._showGuideposts) return;
    this._showGuideposts = shown;
    if (this._map) {
      if (shown) this.addGuidepostsToMap(); else this.removeGuidepostsFromMap();
    }
  }

  private load(): void {
    if (this._wayPointsAnchors !== undefined) return;
    if (this.track instanceof Track) {
      this.subscription = combineLatest([this.track.computed.wayPoints$, this.track.mapService.getPoiIcon$('guidepost')]).subscribe(([list, guidepostIcon]) => this.loadFromTrack(list, guidepostIcon));
    } else {
      this.loadFromSimplifiedTrack(this.track);
    }
  }

  private loadFromTrack(list: TrackWayPoint[], guidepostIcon: SVGSVGElement): void {
    if (this._map && this._showDA) this.removeDAFromMap();
    if (this._map && this._showWP) this.removeWPFromMap();
    if (this._map && this._showBreaks) this.removeBreaksFromMap();
    this._wayPointsAnchors = [];
    this._guidepostsTooltips = [];
    this._breaks = [];
    this._breaksColored = [];
    for (const wp of list) {
      this.createFromWayPoint(wp, list, guidepostIcon);
    }
    if (this._map && this._showDA) this.addDAToMap();
    if (this._map && this._showBreaks) this.addBreaksToMap(this._showBreaks);
    if (this._map && this._showWP) this.addWPToMap();
    if (this._map && this._showGuideposts) this.addGuidepostsToMap();
  }
  private createFromWayPoint(wp: TrackWayPoint, list: TrackWayPoint[], guidepostIcon: SVGSVGElement): void { // NOSONAR
    const twp = WayPointFromTrack.from(wp);
    if (twp) {
      if (twp.isDeparture) {
        let isArrival = twp.isArrival;
        if (!isArrival) {
          const arrival = (list.find(e => WayPointFromTrack.from(e)?.isArrival) as WayPointFromTrack | undefined)?.wayPoint?.point;
          if (arrival && L.latLng(arrival.pos).distanceTo(twp.wayPoint.point.pos) < 5) isArrival = true;
        }
        if (isArrival && !this._isRecording) {
          this._departureAndArrival = this.createDepartureAndArrival(twp.wayPoint.point.pos);
        } else {
          this._departure = this.createDeparture(twp.wayPoint.point.pos);
        }
      } else if (twp.isArrival && (!this._isRecording || twp.isComputedOnly)) {
        if (!this._isRecording) {
          const departure = (list.find(e => WayPointFromTrack.from(e)?.isDeparture) as WayPointFromTrack | undefined)?.wayPoint?.point;
          if (!departure || L.latLng(departure.pos).distanceTo(twp.wayPoint.point.pos) >= 5)
            this._arrival = this.createArrival(twp.wayPoint.point.pos);
        }
      } else {
        this._wayPointsAnchors!.push(this.createWayPoint(twp));
      }
    }
    const bp = BreakPoint.from(wp);
    if (bp) {
      this._breaks!.push(this.createBreakPoint(bp, false));
      this._breaksColored!.push(this.createBreakPoint(bp, true))
    }
    const gp = GuidepostWayPoint.from(wp);
    if (gp) {
      if (!this._guidepostsTooltips!.some(t => (t as any)._guidepost.poi === gp.poi))
        this._guidepostsTooltips!.push(this.createGuidepost(gp, guidepostIcon));
    }
  }

  private loadFromSimplifiedTrack(track: SimplifiedTrackSnapshot): void {
    if (this._map && this._showDA) this.removeDAFromMap();
    this._wayPointsAnchors = [];
    this._guidepostsTooltips = [];
    this._breaks = [];
    this._breaksColored = [];
    const departurePoint = track.points[0];
    const arrivalPoint = track.points.at(-1);
    if (departurePoint && arrivalPoint && L.latLng(departurePoint.lat, departurePoint.lng).distanceTo(arrivalPoint) <= 25) {
      this._departureAndArrival = this.createDepartureAndArrival(departurePoint);
    } else {
      if (departurePoint) {
        this._departure = this.createDeparture(departurePoint);
      }
      if (arrivalPoint) {
        this._arrival = this.createArrival(arrivalPoint);
      }
    }
    if (this._map && this._showDA) this.addDAToMap();
  }

  private createDepartureAndArrival(point: L.LatLngLiteral): MapAnchor {
    return new MapAnchor(point, anchorDABorderColor, this.i18n.texts.way_points.DA, undefined, anchorDATextColor, anchorDepartureFillColor, anchorArrivalFillColor);
  }

  private createDeparture(point: L.LatLngLiteral): MapAnchor {
    return new MapAnchor(point, anchorDepartureBorderColor, this.i18n.texts.way_points.D, undefined, anchorDepartureTextColor, anchorDepartureFillColor);
  }

  private createArrival(point: L.LatLngLiteral): MapAnchor {
    return new MapAnchor(point, anchorArrivalBorderColor, this.i18n.texts.way_points.A, undefined, anchorArrivalTextColor, anchorArrivalFillColor);
  }

  private createWayPoint(wp: WayPointFromTrack): MapAnchor {
    const color = this.getColor();
    return new MapAnchor(wp.wayPoint.point.pos, color, '' + wp.index, undefined, anchorTextColor, new Color(color).setAlpha(0.8).darker(48).toString(), undefined, true, wp);
  }

  private createBreakPoint(wp: BreakPoint, colored: boolean): MapAnchor {
    return new MapAnchor(wp.getPosition(), anchorBreakBorderColor, MapTrackWayPoints.breakPointText(wp), undefined, anchorBreakTextColor, colored ? new Color(this.getColor()).setAlpha(0.66).toString() : anchorBreakFillColor, undefined, true, wp);
  }

  public static breakPointText(breakPoint: BreakPoint): string {
    return breakPoint.isBreak ? '&#8987;' : breakPoint.isPause ? '&#x23F8;' : breakPoint.isResume ? '&#x23F5;' : '&#x23EF;';
  }

  private createGuidepost(guidepost: GuidepostWayPoint, icon: SVGSVGElement): L.Tooltip {
    const tooltip = L.tooltip({className: 'poi', permanent: true}).setLatLng(guidepost.poi.pos).setContent('');
    const span = document.createElement('SPAN');
    span.innerText = guidepost.getText();
    tooltip.setContent(span.outerHTML);
    tooltip.setOpacity(0.75);
    tooltip.setContent(icon.outerHTML + tooltip.getContent());
    (tooltip as any)._guidepost = guidepost;
    return tooltip;
  }

  private addDAToMap(): void {
    this.load();
    if (this._departureAndArrival) this._departureAndArrival.marker.addTo(this._map!); // NOSONAR
    else {
      if (this._departure) this._departure.marker.addTo(this._map!); // NOSONAR
      if (this._arrival) this._arrival.marker.addTo(this._map!); // NOSONAR
    }
  }

  private removeDAFromMap(): void {
    if (this._departureAndArrival) this._departureAndArrival.marker.removeFrom(this._map!); // NOSONAR
    else {
      if (this._departure) this._departure.marker.removeFrom(this._map!); // NOSONAR
      if (this._arrival) this._arrival.marker.removeFrom(this._map!); // NOSONAR
    }
  }

  private addWPToMap(): void {
    this.load();
    for (const anchor of this._wayPointsAnchors!) {
      anchor.marker.addTo(this._map!); // NOSONAR
    }
  }

  private removeWPFromMap(): void {
    if (this._wayPointsAnchors) {
      for (const anchor of this._wayPointsAnchors) {
        anchor.marker.removeFrom(this._map!); // NOSONAR
      }
    }
  }

  private addGuidepostsToMap(): void {
    this.load();
    for (const tooltip of this._guidepostsTooltips!) {
      tooltip.addTo(this._map!);
    }
  }

  private removeGuidepostsFromMap(): void {
    if (this._guidepostsTooltips) {
      for (const tooltip of this._guidepostsTooltips) {
        tooltip.removeFrom(this._map!);
      }
    }
  }

  private addBreaksToMap(style: ShowBreaksStyle): void {
    this.load();
    const toShow = (style === 'colored' ? this._breaksColored! : this._breaks!);
    const toHide = (style === 'colored' ? this._breaks! : this._breaksColored!);
    for (const anchor of toShow) {
      anchor.marker.addTo(this._map!); // NOSONAR
    }
    for (const anchor of toHide) {
      anchor.marker.removeFrom(this._map!); // NOSONAR
    }
  }

  private removeBreaksFromMap(): void {
    if (this._breaks)
      for (const anchor of this._breaks) {
        anchor.marker.removeFrom(this._map!); // NOSONAR
      }
    if (this._breaksColored)
      for (const anchor of this._breaksColored) {
        anchor.marker.removeFrom(this._map!); // NOSONAR
      }
  }

  public highlight(wp: TrackWayPoint): void {
    const anchor = this.getAnchor(wp);
    if (anchor) {
      anchor.marker.getElement()?.classList.add('highlighted');
      if (this._wayPointsAnchors) {
        for (const a of this._wayPointsAnchors) {
          if (a !== anchor) a.marker.getElement()?.classList.add('semi-transparent');
        }
      }
      if (this._departure && anchor !== this._departure) this._departure.marker.getElement()?.classList.add('semi-transparent');
      if (this._arrival && anchor !== this._arrival) this._arrival.marker.getElement()?.classList.add('semi-transparent');
      if (this._guidepostsTooltips)
        for (const t of this._guidepostsTooltips) t.setOpacity(0.5);
    } else {
      const gp = GuidepostWayPoint.from(wp);
      if (gp) {
        const tooltip = this._guidepostsTooltips?.find(t => (t as any)._guidepost.poi === gp.poi);
        if (tooltip) tooltip.setOpacity(1);
        if (this._guidepostsTooltips) for (const t of this._guidepostsTooltips) if (t !== tooltip) t.setOpacity(0.5);
        if (this._wayPointsAnchors) for (const a of this._wayPointsAnchors) a.marker.getElement()?.classList.add('semi-transparent');
        if (this._departure) this._departure.marker.getElement()?.classList.add('semi-transparent');
        if (this._arrival) this._arrival.marker.getElement()?.classList.add('semi-transparent');
      }
    }
  }

  public unhighlight(wp: TrackWayPoint): void {
    if (this._guidepostsTooltips) for (const t of this._guidepostsTooltips) t.setOpacity(0.75);
    if (this._wayPointsAnchors) for (const a of this._wayPointsAnchors) a.marker.getElement()?.classList.remove('semi-transparent');
    if (this._departure) this._departure.marker.getElement()?.classList.remove('semi-transparent');
    if (this._arrival) this._arrival.marker.getElement()?.classList.remove('semi-transparent');
    const anchor = this.getAnchor(wp);
    if (anchor) {
      anchor.marker.getElement()?.classList.remove('highlighted');
    }
  }

  private getAnchor(wp: TrackWayPoint): MapAnchor | undefined {
    const twp = WayPointFromTrack.from(wp);
    if (twp?.isDeparture) {
      return this._departure || this._departureAndArrival;
    }
    if (twp?.isArrival) {
      return this._arrival || this._departureAndArrival;
    }
    const bp = BreakPoint.from(wp);
    if (bp && this._breaks) {
      return this._breaks.find(b => b.data === bp);
    }
    if (this._wayPointsAnchors) {
      return this._wayPointsAnchors.find(b => b.data === twp);
    }
    return undefined;
  }

}
