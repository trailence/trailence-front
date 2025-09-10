import { ComputedWayPoint, Track } from 'src/app/model/track';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapTrackPath } from './map-track-path';
import { Trail } from 'src/app/model/trail';
import { MapTrackWayPoints } from './map-track-way-points';
import { MapTrackArrowPath } from './map-track-arrows-path';
import * as L from 'leaflet';
import { SimplifiedPoint, SimplifiedTrackSnapshot } from 'src/app/model/snapshots';

export class MapTrack {

  public data: any;
  public highlighted = false;
  public ignoreCursorHover = false;

  constructor(
    private readonly _trail: Trail | undefined,
    private readonly _track: Track | SimplifiedTrackSnapshot,
    color: string,
    smoothFactor: number,
    isRecording: boolean,
    i18n: I18nService,
    weight: number = 3,
  ) {
    this._path = new MapTrackPath(_track, color, smoothFactor, weight, this);
    this._wayPoints = new MapTrackWayPoints(_track, isRecording, () => this.color, i18n);
    this._arrowPath = new MapTrackArrowPath(_track);
  }

  private readonly _path: MapTrackPath;
  private readonly _wayPoints: MapTrackWayPoints;
  private readonly _arrowPath: MapTrackArrowPath;

  public addTo(map: L.Map): void {
    this._path.addTo(map);
    this._arrowPath.addTo(map);
    this._wayPoints.addTo(map);
  }

  public remove(): void {
    this._path.remove();
    this._wayPoints.remove();
    this._arrowPath.remove();
  }

  public get trail(): Trail | undefined { return this._trail; }
  public get track(): Track | SimplifiedTrackSnapshot { return this._track; }

  public get bounds(): L.LatLngBounds | undefined {
    if (this._track instanceof Track) return this._track.metadata.bounds;
    const pathBounds = this._path.getBounds(false);
    if (pathBounds) return pathBounds;
    return this.boundsFromSimplifiedPoints(this._track.points);
  }
  private boundsFromSimplifiedPoints(points: SimplifiedPoint[]): L.LatLngBounds | undefined {
    let minLat, maxLat, minLng, maxLng;
    for (const pt of points) {
      if (minLat === undefined || pt.lat < minLat) minLat = pt.lat;
      if (maxLat === undefined || pt.lat > maxLat) maxLat = pt.lat;
      if (minLng === undefined || pt.lng < minLng) minLng = pt.lng;
      if (maxLng === undefined || pt.lng > maxLng) maxLng = pt.lng;
    }
    if (minLat === undefined) return undefined;
    return L.latLngBounds({lat: minLat, lng: minLng!}, {lat: maxLat!, lng: maxLng!}); // NOSONAR
  }

  public get color(): string { return this._path.color; }
  public set color(value: string) {
    if (this._path.color === value) return;
    this._path.color = value;
    this._wayPoints.reset();
  }

  public showDepartureAndArrivalAnchors(show: boolean = true): void {
    this._wayPoints.showDepartureAndArrival(show);
  }

  public showWayPointsAnchors(show: boolean = true): void {
    this._wayPoints.showWayPoints(show);
  }

  public showBreaksAnchors(show: boolean = true): void {
    this._wayPoints.showBreaks(show);
  }

  public showArrowPath(show: boolean = true): void {
    this._arrowPath.show(show);
  }

  public bringToFront(): void {
    this._path.bringToFront();
    this._arrowPath.bringToFront();
  }

  public bringToBack(): void {
    this._path.bringToBack();
    this._arrowPath.bringToBack();
  }

  public highlightWayPoint(wp: ComputedWayPoint): void {
    this._wayPoints.highlight(wp);
  }

  public unhighlightWayPoint(wp: ComputedWayPoint): void {
    this._wayPoints.unhighlight(wp);
  }

}
