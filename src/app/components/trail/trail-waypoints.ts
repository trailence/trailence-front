import { BehaviorSubject, Subscription } from 'rxjs';
import { ComputedWayPoint, Track } from 'src/app/model/track';
import { Trail } from 'src/app/model/trail';
import { MapAnchor } from '../map/markers/map-anchor';
import { anchorArrivalBorderColor, anchorArrivalFillColor, anchorArrivalTextColor, anchorBorderColor, anchorBreakBorderColor, anchorBreakFillColor, anchorBreakTextColor, anchorDepartureBorderColor, anchorDepartureFillColor, anchorDepartureTextColor, anchorFillColor, anchorTextColor, MapTrackWayPoints } from '../map/track/map-track-way-points';
import { MapTrack } from '../map/track/map-track';
import { samePositionRound } from 'src/app/model/point';
import { PointReference } from 'src/app/model/point-reference';
import { TrailSelection } from './trail-selection';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { Photo } from 'src/app/model/photo';
import * as L from 'leaflet';
import { Arrays } from 'src/app/utils/arrays';

export class TrailsWaypoints {

  trails: TrailWaypoints[] = [];
  changes$ = new BehaviorSubject<any>(undefined);

  private _mapTracks: MapTrack[] = [];
  private _showBreaksOnMap = false;
  public get showBreaksOnMap() { return this._showBreaksOnMap; }
  public set showBreaksOnMap(value: boolean) {
    if (this.showBreaksOnMapLocked) return;
    if (this._showBreaksOnMap === value) return;
    if (value && !this.canShowBreaksOnMap()) return;
    this._showBreaksOnMap = value;
    for (const mt of this._mapTracks) mt.showBreaksAnchors(value);
    this.trails[0].showBreaks = value;
    this.changes$.next(true);
  }
  public showBreaksOnMapLocked = false;

  private photosWithPosition: {photos: Photo[], point: L.LatLngExpression}[] = [];

  constructor(
    private readonly selection: TrailSelection,
    public readonly i18n: I18nService,
  ) {}

  public reset(): void {
    this.update([], []);
  }

  public update(trails: {trail: Trail, track: Track, recording: boolean}[], mapTracks: MapTrack[]): void {
    const toRemove = [...this.trails];
    const newTrails: TrailWaypoints[] = [];
    for (const trail of trails) {
      const index = toRemove.findIndex(t => t.trail === trail.trail && t.track === trail.track);
      if (index >= 0) {
        newTrails.push(toRemove[index]);
        toRemove.splice(index, 1);
      } else {
        newTrails.push(new TrailWaypoints(this, trail.trail, trail.track, trail.recording, this.photosWithPosition, () => this.wayPointsUpdated()));
      }
    }
    for (const t of toRemove) t.destroy();
    this.trails = newTrails;
    this._mapTracks = mapTracks;
    if (this._showBreaksOnMap && !this.canShowBreaksOnMap())
      this._showBreaksOnMap = false;
    for (const mt of mapTracks) mt.showBreaksAnchors(this._showBreaksOnMap);
    this.changes$.next(true);
  }

  public updatePhotos(photosWithPosition: {photos: Photo[], point: L.LatLngExpression}[]): void {
    this.photosWithPosition = photosWithPosition;
    let changed = false;
    for (const t of this.trails) {
      changed ||= t.updatePhotos(photosWithPosition);
    }
    if (changed) this.changes$.next(true);
  }

  public canShowBreaksOnMap(): boolean {
    return this.trails.length === 1 && this.trails[0].hasBreaks;
  }

  private wayPointsUpdated(): void {
    this.changes$.next(true);
  }

  _highlightedWayPoint?: ComputedWayPoint;
  private _highlightedWayPointFromClick = false;

  public get highlightedWayPoint() { return this._highlightedWayPoint; }
  public get highlightedWayPointFromClick() { return this._highlightedWayPointFromClick; }

  highlightWayPoint(wp: ComputedWayPoint, click: boolean): void {
    const trail = this.trails.find(t => !!t.wayPoints.find(w => w.computed === wp));
    if (click) this.waypointClick(wp, trail);

    if (this._highlightedWayPoint === wp) {
      if (click) this._highlightedWayPointFromClick = true;
      return;
    }
    if (!click && this._highlightedWayPointFromClick) return;
    if (this._highlightedWayPoint) {
      this.unhighlightWayPoint(this._highlightedWayPoint, true);
    }
    this._highlightedWayPoint = wp;
    this._highlightedWayPointFromClick = click;
    if (trail) {
      const mapTrack = this._mapTracks.find(mt => mt.track === trail.track);
      mapTrack?.highlightWayPoint(wp);
    }
  }

  private waypointClick(wp: ComputedWayPoint, trail: TrailWaypoints | undefined): void {
    if (trail) {
      if (wp.nearestSegmentIndex !== undefined && wp.nearestPointIndex !== undefined &&
        wp.nearestSegmentIndex < trail.track.segments.length && wp.nearestPointIndex < trail.track.segments[wp.nearestSegmentIndex].points.length
      ) {
        const pathPoint = trail.track.segments[wp.nearestSegmentIndex].points[wp.nearestPointIndex];
        if (samePositionRound(pathPoint.pos, wp.wayPoint.point.pos)) {
          this.selection.selectPoint([new PointReference(trail.track, wp.nearestSegmentIndex, wp.nearestPointIndex)]);
        }
      }
      this.selection.selectedWayPoint$.next(wp.wayPoint);
    } else {
      this.selection.selectedWayPoint$.next(undefined);
    }
  }

  unhighlightWayPoint(wp: ComputedWayPoint, force: boolean): boolean {
    if (this._highlightedWayPoint === wp && (force || !this._highlightedWayPointFromClick)) {
      this._highlightedWayPoint = undefined;
      this._highlightedWayPointFromClick = false;
      if (this.selection.selectedWayPoint$.value === wp.wayPoint)
        this.selection.selectedWayPoint$.next(undefined);
      const trail = this.trails.find(t => !!t.wayPoints.find(w => w.computed === wp));
      if (trail) {
        const mapTrack = this._mapTracks.find(mt => mt.track === trail.track);
        mapTrack?.unhighlightWayPoint(wp);
      }
      return true;
    }
    return false;
  }

}

export class TrailWaypoints {

  wayPoints: TrailWayPoint[] = [];
  wayPointDepartureAndArrival?: TrailWayPoint;
  wayPointsImages: string[] = [];
  hasBreaks = false;
  private _showBreaks = false;

  private readonly subscription: Subscription;

  public get showBreaks() { return this._showBreaks; }
  public set showBreaks(value: boolean) {
    if (value === this._showBreaks) return;
    this._showBreaks = value;
    this.trails.showBreaksOnMap = value;
  }

  private currentPhotos: {photos: Photo[], point: L.LatLngExpression}[];

  constructor(
    readonly trails: TrailsWaypoints,
    public readonly trail: Trail,
    public readonly track: Track,
    public readonly recording: boolean,
    readonly initialPhotos: {photos: Photo[], point: L.LatLngExpression}[],
    readonly onUpdated: () => void,
  ) {
    this.currentPhotos = initialPhotos;
    this.subscription = track.computedWayPoints$.subscribe(
      wayPoints => {
        const previousHighlighted = trails.highlightedWayPoint;
        const previousHighlightedIndex = previousHighlighted ? this.wayPoints.findIndex(w => w.computed === trails.highlightedWayPoint) : -1;
        if (previousHighlightedIndex >= 0) trails.unhighlightWayPoint(previousHighlighted!, true);
        this.wayPoints = wayPoints.map(computed => ({computed, photos: this.getPhotos(this.currentPhotos, computed.wayPoint.point.pos)}));
        this.hasBreaks = wayPoints.some(wp => wp.breakPoint);
        this.wayPointDepartureAndArrival = this.wayPoints.find(wp => wp.computed.isDeparture && wp.computed.isArrival);
        this.wayPointsImages = this.wayPoints.map(wp => {
          if (wp.computed.isDeparture)
            return MapAnchor.createDataIcon(anchorDepartureBorderColor, trails.i18n.texts.way_points.D, anchorDepartureTextColor, anchorDepartureFillColor);
          if (wp.computed.breakPoint)
            return MapAnchor.createDataIcon(anchorBreakBorderColor, MapTrackWayPoints.breakPointText(wp.computed.breakPoint), anchorBreakTextColor, anchorBreakFillColor);
          if (wp.computed.isArrival && (!recording || wp.computed.isComputedOnly))
            return MapAnchor.createDataIcon(anchorArrivalBorderColor, trails.i18n.texts.way_points.A, anchorArrivalTextColor, anchorArrivalFillColor);
          return MapAnchor.createDataIcon(anchorBorderColor, '' + wp.computed.index, anchorTextColor, anchorFillColor);
        });
        if (this.wayPointDepartureAndArrival)
          this.wayPointsImages.push(MapAnchor.createDataIcon(anchorArrivalBorderColor, trails.i18n.texts.way_points.A, anchorArrivalTextColor, anchorArrivalFillColor));
        onUpdated();
      }
    );
  }

  public updatePhotos(photosWithPosition: {photos: Photo[], point: L.LatLngExpression}[]): boolean {
    this.currentPhotos = photosWithPosition;
    let changed = false;
    for (const w of this.wayPoints) {
      const newPhotos = this.getPhotos(photosWithPosition, w.computed.wayPoint.point.pos);
      if (!Arrays.sameContent(w.photos, newPhotos)) {
        w.photos = newPhotos;
        changed = true;
      }
    }
    return changed;
  }

  private getPhotos(photosWithPosition: {photos: Photo[], point: L.LatLngExpression}[], pos: L.LatLngExpression): Photo[] {
    const result: Photo[] = [];
    const position = L.latLng(pos);
    for (const p of photosWithPosition) {
      if (position.distanceTo(p.point) <= 25)
        result.push(...p.photos);
    }
    return result;
  }

  destroy(): void {
    this.subscription.unsubscribe();
  }

}

export interface TrailWayPoint {
  computed: ComputedWayPoint;
  photos: Photo[];
}
