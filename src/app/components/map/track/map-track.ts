import { Track } from '@trailence/model/track';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { MapTrackPath } from './map-track-path';
import { Trail } from '@trailence/model/trail';
import { MapTrackWayPoints, ShowBreaksStyle } from './map-track-way-points';
import { MapTrackArrowPath } from './map-track-arrows-path';
import * as L from 'leaflet';
import { SimplifiedPoint, SimplifiedTrackSnapshot } from '@trailence/model/snapshots';
import { TrackWayPoint } from '@trailence/utils/track-waypoints/track-waypoint';
import { ElementsFor3D, LeafletElement, MapElement, MapElementPosition, MapLibreElement } from '../map-element';
import { BehaviorSubject, Observable, of } from 'rxjs';

export function getMapTrackId(track: Track | SimplifiedTrackSnapshot): string {
  return 'track-' + track.uuid + '#' + track.owner;
}

export class MapTrack extends MapElement {

  public data: any;
  public highlighted = false;
  public ignoreCursorHover = false;

  public onWayPointClick?: (wp: TrackWayPoint) => void;

  constructor(
    private readonly _trail: Trail | undefined,
    private readonly _track: Track | SimplifiedTrackSnapshot,
    color: string,
    smoothFactor: number,
    isRecording: boolean,
    i18n: I18nService,
    weight: number = 3,
  ) {
    super(getMapTrackId(_track));
    this._path = new MapTrackPath(_track, this.id + '$path', color, smoothFactor, weight, this);
    this._wayPoints = new MapTrackWayPoints(_track, isRecording, () => this.color, i18n, wp => this.onWayPointClick?.(wp));
  }

  private readonly _path: MapTrackPath;
  private readonly _wayPoints: MapTrackWayPoints;

  public override get2DElements$(): Observable<LeafletElement<any>[]> {
    // TODO
    return this._path.get2DElements$();
    //return [...this._path.get2DElements$(), ...this._arrowPath.get2DElements$(), ...this._wayPoints.get2DElements$()];
  }

  public override get3DElements$(): ElementsFor3D {
    // TODO
    return this._path.get3DElements$();
    //return { elements2d$: this.get2DElements$(), elements3d$: of([]) };
  }

  public get trail(): Trail | undefined { return this._trail; }
  public get track(): Track | SimplifiedTrackSnapshot { return this._track; }

  public get fitBounds(): L.LatLngBounds | undefined {
    if (this._track instanceof Track) return this._track.metadata.bounds;
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

  public showPathWithElevationColors(show: boolean): void {
    this._path.eleColors = show;
    // TODO this._arrowPath.weight = show ? 3 : 2;
  }

  public showDepartureAndArrivalAnchors(show: boolean = true): void {
    this._wayPoints.showDepartureAndArrival(show);
  }

  public showWayPointsAnchors(show: boolean = true): void {
    this._wayPoints.showWayPoints(show);
  }

  public showBreaksAnchors(style: ShowBreaksStyle): void {
    this._wayPoints.showBreaks(style);
  }

  public showGuideposts(shown: boolean = true): void {
    this._wayPoints.showGuideposts(shown);
  }

  public showArrowPath(show: boolean = true, color?: string): void {
    // TODO this._arrowPath.show(show, color);
  }

  public bringToFront(): void {
    // TODO this._path.bringToFront();
    // TODO this._arrowPath.bringToFront();
  }

  public bringToBack(): void {
    // TODO this._path.bringToBack();
    // TODO this._arrowPath.bringToBack();
  }

  public highlightWayPoint(wp: TrackWayPoint): void {
    this._wayPoints.highlight(wp);
  }

  public unhighlightWayPoint(wp: TrackWayPoint): void {
    this._wayPoints.unhighlight(wp);
  }

}
