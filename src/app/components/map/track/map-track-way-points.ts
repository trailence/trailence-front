import { BreakWayPoint, ComputedWayPoint, Track } from 'src/app/model/track';
import { MapAnchor } from '../markers/map-anchor';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';
import { Color } from 'src/app/utils/color';
import { SimplifiedTrackSnapshot } from 'src/app/model/snapshots';
import { pointsAreEqual } from 'src/app/model/point-descriptor';

export const anchorBorderColor = '#d00000';
export const anchorFillColor = '#a00000';
export const anchorTextColor = '#ffffff';

const anchorDABorderColor = 'rgba(64, 128, 0, 0.75)';
const anchorDATextColor = anchorTextColor;

export const anchorDepartureBorderColor = 'rgba(0, 128, 0, 0.75)';
export const anchorDepartureFillColor = 'rgba(0, 128, 0, 0.75)';
export const anchorDepartureTextColor = anchorTextColor;

export const anchorArrivalBorderColor = 'rgba(196, 0, 0, 0.75)';
export const anchorArrivalFillColor = 'rgba(196, 0, 0, 0.75)';
export const anchorArrivalTextColor = anchorTextColor;

export const anchorBreakBorderColor = '#b0865cD8';
export const anchorBreakFillColor = '#C8986890';
export const anchorBreakTextColor = '#ffffff';

export class MapTrackWayPoints {

  private _anchors?: MapAnchor[];
  private _breaks?: MapAnchor[];
  private _departure?: MapAnchor;
  private _arrival?: MapAnchor;
  private _departureAndArrival?: MapAnchor;

  private _showDA = false;
  private _showWP = false;
  private _showBreaks = false;
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
    if (this._showBreaks) this.addBreaksToMap();
    if (this._showWP) this.addWPToMap();
  }

  public remove(): void {
    if (!this._map) return;
    if (this._showDA) this.removeDAFromMap();
    if (this._showBreaks) this.removeBreaksFromMap();
    if (this._showWP) this.removeWPFromMap();
    this._map = undefined;
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }

  public reset(): void {
    if (!this._map) return;
    const map = this._map;
    this.remove();
    this._anchors = undefined;
    this._breaks = undefined;
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

  public showBreaks(show: boolean): void {
    if (show === this._showBreaks) return;
    this._showBreaks = show;
    if (this._map) {
      if (show) this.addBreaksToMap(); else this.removeBreaksFromMap();
    }
  }

  private load(): void {
    if (this._anchors !== undefined) return;
    if (this.track instanceof Track) {
      this.subscription = this.track.computedWayPoints$.subscribe(list => this.loadFromTrack(list));
    } else {
      this.loadFromSimplifiedTrack(this.track);
    }
  }

  private loadFromTrack(list: ComputedWayPoint[]): void {
    if (this._map && this._showDA) this.removeDAFromMap();
    if (this._map && this._showWP) this.removeWPFromMap();
    if (this._map && this._showBreaks) this.removeBreaksFromMap();
    this._anchors = [];
    this._breaks = [];
    for (const wp of list) {
      this.createFromWayPoint(wp, list);
    }
    if (this._map && this._showDA) this.addDAToMap();
    if (this._map && this._showBreaks) this.addBreaksToMap();
    if (this._map && this._showWP) this.addWPToMap();
  }
  private createFromWayPoint(wp: ComputedWayPoint, list: ComputedWayPoint[]): void {
    if (wp.isDeparture) {
      let isArrival = wp.isArrival;
      if (!isArrival) {
        const arrival = list.find(e => e.isArrival)?.wayPoint.point;
        if (arrival && L.latLng(arrival.pos).distanceTo(wp.wayPoint.point.pos) < 5) isArrival = true;
      }
      if (isArrival && !this._isRecording) {
        this._departureAndArrival = this.createDepartureAndArrival(wp.wayPoint.point.pos);
      } else {
        this._departure = this.createDeparture(wp.wayPoint.point.pos);
      }
    } else if (wp.isArrival) {
      if (!this._isRecording) {
        const departure = list.find(e => e.isDeparture)?.wayPoint.point;
        if (!departure || L.latLng(departure.pos).distanceTo(wp.wayPoint.point.pos) >= 5)
          this._arrival = this.createArrival(wp.wayPoint.point.pos);
      }
    } else if (wp.breakPoint) {
      this._breaks!.push(this.createBreakPoint(wp));
    } else {
      this._anchors!.push(this.createWayPoint(wp));
    }
  }

  private loadFromSimplifiedTrack(track: SimplifiedTrackSnapshot): void {
    if (this._map && this._showDA) this.removeDAFromMap();
    this._anchors = [];
    this._breaks = [];
    const departurePoint = track.points[0];
    const arrivalPoint = track.points[track.points.length - 1];
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

  private createWayPoint(wp: ComputedWayPoint): MapAnchor {
    const color = this.getColor();
    return new MapAnchor(wp.wayPoint.point.pos, color, '' + wp.index, undefined, anchorTextColor, new Color(color).setAlpha(0.8).darker(48).toString(), undefined, true, wp);
  }

  private createBreakPoint(wp: ComputedWayPoint): MapAnchor {
    return new MapAnchor(wp.wayPoint.point.pos, anchorBreakBorderColor, MapTrackWayPoints.breakPointText(wp.breakPoint!), undefined, anchorBreakTextColor, anchorBreakFillColor, undefined, true, wp);
  }

  public static breakPointText(breakPoint: BreakWayPoint): string {
    return breakPoint.isBreak ? '&#8987;' : breakPoint.isPause ? '&#x23F8;' : breakPoint.isResume ? '&#x23F5;' : '&#x23EF;';
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
    for (const anchor of this._anchors!) {
      anchor.marker.addTo(this._map!); // NOSONAR
    }
  }

  private removeWPFromMap(): void {
    if (this._anchors)
      for (const anchor of this._anchors) {
        anchor.marker.removeFrom(this._map!); // NOSONAR
      }
  }

  private addBreaksToMap(): void {
    this.load();
    for (const anchor of this._breaks!) {
      anchor.marker.addTo(this._map!); // NOSONAR
    }
  }

  private removeBreaksFromMap(): void {
    if (this._breaks)
      for (const anchor of this._breaks) {
        anchor.marker.removeFrom(this._map!); // NOSONAR
      }
  }

  public highlight(wp: ComputedWayPoint): void {
    const anchor = this.getAnchor(wp);
    if (anchor) {
      anchor.marker.getElement()?.classList.add('highlighted');
    }
  }

  public unhighlight(wp: ComputedWayPoint): void {
    const anchor = this.getAnchor(wp);
    if (anchor) {
      anchor.marker.getElement()?.classList.remove('highlighted');
    }
  }

  private getAnchor(wp: ComputedWayPoint): MapAnchor | undefined {
    if (wp.isDeparture) {
      return this._departure || this._departureAndArrival;
    }
    if (wp.isArrival) {
      return this._arrival || this._departureAndArrival;
    }
    if (wp.breakPoint && this._breaks) {
      return this._breaks.find(b => b.data === wp);
    }
    if (this._anchors) {
      return this._anchors.find(b => b.data === wp);
    }
    return undefined;
  }

}
