import { Track } from 'src/app/model/track';
import { MapAnchor } from '../markers/map-anchor';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { SimplifiedTrackSnapshot } from 'src/app/services/database/track-database';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';

export const anchorBorderColor = '#d00000';
export const anchorFillColor = '#a00000';
export const anchorTextColor = '#ffffff';
const anchorBorderColorHighlighted = '#00d000';

const anchorDABorderColor = 'rgba(64, 128, 0, 0.75)';
const anchorDATextColor = anchorTextColor;

export const anchorDepartureBorderColor = 'rgba(0, 128, 0, 0.75)';
export const anchorDepartureFillColor = 'rgba(0, 128, 0, 0.75)';
export const anchorDepartureTextColor = anchorTextColor;

export const anchorArrivalBorderColor = 'rgba(196, 0, 0, 0.75)';
export const anchorArrivalFillColor = 'rgba(196, 0, 0, 0.75)';
export const anchorArrivalTextColor = anchorTextColor;

export class MapTrackWayPoints {

  private _anchors?: MapAnchor[];
  private _departure?: MapAnchor;
  private _arrival?: MapAnchor;
  private _departureAndArrival?: MapAnchor;

  private _showDA = false;
  private _showWP = false;
  private _map?: L.Map;
  private subscription?: Subscription;

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
    this.subscription?.unsubscribe();
    this.subscription = undefined;
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

  private load(): void {
    if (this._anchors !== undefined) return;
    this._anchors = [];
    if (this._track instanceof Track) {
      this.subscription = this._track.computedWayPoints$.subscribe(
        list => {
          if (this._map && this._showDA) this.removeDAFromMap();
          if (this._map && this._showWP) this.removeWPFromMap();
          this._anchors = [];
          for (const wp of list) {
            if (wp.isDeparture) {
              if (wp.isArrival && !this._isRecording) {
                this._departureAndArrival = this.createDepartureAndArrival(wp.wayPoint.point.pos);
              } else {
                this._departure = this.createDeparture(wp.wayPoint.point.pos);
              }
            } else if (wp.isArrival) {
              if (!this._isRecording)
                this._arrival = this.createArrival(wp.wayPoint.point.pos);
            } else {
              this._anchors.push(this.createWayPoint(wp.wayPoint.point.pos, list.indexOf(wp)));
            }
          }
          if (this._map && this._showDA) this.addDAToMap();
          if (this._map && this._showWP) this.addWPToMap();
        }
      );
    } else {
      const departurePoint = this._track.points[0];
      const arrivalPoint = this._track.points[this._track.points.length - 1];
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
    }
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

  private createWayPoint(point: L.LatLngLiteral, index: number): MapAnchor {
    return new MapAnchor(point, anchorBorderColor, '' + index, undefined, anchorTextColor, anchorFillColor);
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
