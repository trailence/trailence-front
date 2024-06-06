import { Track } from 'src/app/model/track';
import { MapAnchor } from '../markers/map-anchor';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { SimplifiedTrackSnapshot } from 'src/app/services/database/track-database';

const anchorBorderColor = '#d00000';
const anchorFillColor = '#a00000';
const anchorTextColor = '#ffffff';
const anchorBorderColorHighlighted = '#00d000';

const anchorDABorderColor = 'rgba(64, 128, 0, 0.75)';
const anchorDATextColor = anchorTextColor;

const anchorDepartureBorderColor = 'rgba(0, 128, 0, 0.75)';
const anchorDepartureFillColor = 'rgba(0, 128, 0, 0.75)';
const anchorDepartureTextColor = anchorTextColor;

const anchorArrivalBorderColor = 'rgba(196, 0, 0, 0.75)';
const anchorArrivalFillColor = 'rgba(196, 0, 0, 0.75)';
const anchorArrivalTextColor = anchorTextColor;

export class MapTrackWayPoints {

  private _anchors?: MapAnchor[];
  private _departure?: MapAnchor;
  private _arrival?: MapAnchor;
  private _departureAndArrival?: MapAnchor;

  private _showDA = false;
  private _showWP = false;
  private _map?: L.Map;

  constructor(
    private _track: Track | SimplifiedTrackSnapshot,
    private _isRecording: boolean,
    private i18n: I18nService,
  ) {}

  public addTo(map: L.Map): void {
    if (this._map) return;
    this._map = map;
    if (this._showDA) this.addDAToMap();
    if (this._showWP) this.addWPToMap();
  }

  public remove(): void {
    if (!this._map) return;
    if (this._showDA) this.removeDAFromMap();
    if (this._showWP) this.removeWPFromMap();
    this._map = undefined;
  }

  public showDepartureAndArrival(show: boolean): void {
    if (this._showDA === show) return;
    this._showDA = show;
    if (this._map) {
      if (show) this.addDAToMap(); else this.removeDAFromMap();
    }
  }

  public showWayPoints(show: boolean): void {
    if (this._showWP === show) return;
    this._showWP = show;
    if (this._map) {
      if (show) this.addWPToMap(); else this.removeWPFromMap();
    }
  }

  private reset(): void {
    this._anchors = undefined;
    this._departure = undefined;
    this._arrival = undefined;
    this._departureAndArrival = undefined;
  }

  private load(): void {
    if (this._anchors !== undefined) return;
    let departurePoint: L.LatLngLiteral | undefined;
    let arrivalPoint: L.LatLngLiteral | undefined;
    if (this._track instanceof Track) {
      departurePoint = this._track.departurePoint?.pos;
      arrivalPoint = this._track.arrivalPoint?.pos;
    } else {
      departurePoint = this._track.points[0];
      arrivalPoint = this._track.points[this._track.points.length - 1];
    }
    if (departurePoint && arrivalPoint && departurePoint.lat === arrivalPoint.lat && departurePoint.lng === arrivalPoint.lng) {
      // D/A
      this._departureAndArrival = new MapAnchor(departurePoint, anchorDABorderColor, this.i18n.texts.way_points.DA, undefined, anchorDATextColor, anchorDepartureFillColor, anchorArrivalFillColor);
    } else {
      if (departurePoint) {
        // D
        this._departure = new MapAnchor(departurePoint, anchorDepartureBorderColor, this.i18n.texts.way_points.D, undefined, anchorDepartureTextColor, anchorDepartureFillColor);
      }
      if (arrivalPoint) {
        // A
        this._arrival = new MapAnchor(arrivalPoint, anchorArrivalBorderColor, this.i18n.texts.way_points.A, undefined, anchorArrivalTextColor, anchorArrivalFillColor);
      }
    }
    this._anchors = [];
    if (this._track instanceof Track) {
      let num = 1;
      for (const wp of this._track.wayPoints) {
        if (wp.point.samePosition(departurePoint) || wp.point.samePosition(arrivalPoint)) continue;
        const anchor = new MapAnchor(wp.point.pos, anchorBorderColor, '' + num, undefined, anchorTextColor, anchorFillColor);
        this._anchors.push(anchor);
        num++;
      }
      // TODO listen to changes
    }
  }

  private addDAToMap(): void {
    this.load();
    if (this._departureAndArrival) this._departureAndArrival.marker.addTo(this._map!);
    else {
      if (this._departure) this._departure.marker.addTo(this._map!);
      if (this._arrival) this._arrival.marker.addTo(this._map!);
    }
  }

  private removeDAFromMap(): void {
    if (this._departureAndArrival) this._departureAndArrival.marker.removeFrom(this._map!);
    else {
      if (this._departure) this._departure.marker.removeFrom(this._map!);
      if (this._arrival) this._arrival.marker.removeFrom(this._map!);
    }
  }

  private addWPToMap(): void {
    this.load();
    for (const anchor of this._anchors!) {
      anchor.marker.addTo(this._map!);
    }
  }

  private removeWPFromMap(): void {
    if (this._anchors)
      for (const anchor of this._anchors) {
        anchor.marker.removeFrom(this._map!);
      }
  }

}
