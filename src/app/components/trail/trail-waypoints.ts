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
        newTrails.push(new TrailWaypoints(this, trail.trail, trail.track, trail.recording, () => this.wayPointsUpdated()));
      }
    }
    toRemove.forEach(t => t.destroy());
    this.trails = newTrails;
    this._mapTracks = mapTracks;
    if (this._showBreaksOnMap && !this.canShowBreaksOnMap())
      this._showBreaksOnMap = false;
    for (const mt of mapTracks) mt.showBreaksAnchors(this._showBreaksOnMap);
    this.changes$.next(true);
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
    const trail = this.trails.find(t => t.wayPoints.indexOf(wp) >= 0);
    if (click) {
      if (trail && wp.nearestSegmentIndex !== undefined && wp.nearestPointIndex !== undefined &&
        wp.nearestSegmentIndex < trail.track.segments.length && wp.nearestPointIndex < trail.track.segments[wp.nearestSegmentIndex].points.length
      ) {
        const pathPoint = trail.track.segments[wp.nearestSegmentIndex].points[wp.nearestPointIndex];
        if (samePositionRound(pathPoint.pos, wp.wayPoint.point.pos)) {
          this.selection.selectPoint([new PointReference(trail.track, wp.nearestSegmentIndex, wp.nearestPointIndex)]);
        }
      }
      if (trail)
        this.selection.selectedWayPoint$.next(wp.wayPoint);
      else
        this.selection.selectedWayPoint$.next(undefined);
    }

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

  unhighlightWayPoint(wp: ComputedWayPoint, force: boolean): boolean {
    if (this._highlightedWayPoint === wp && (force || !this._highlightedWayPointFromClick)) {
      this._highlightedWayPoint = undefined;
      this._highlightedWayPointFromClick = false;
      if (this.selection.selectedWayPoint$.value === wp.wayPoint)
        this.selection.selectedWayPoint$.next(undefined);
      const trail = this.trails.find(t => t.wayPoints.indexOf(wp) >= 0);
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

  wayPoints: ComputedWayPoint[] = [];
  wayPointDepartureAndArrival?: ComputedWayPoint;
  wayPointsImages: string[] = [];
  hasBreaks = false;
  private _showBreaks = false;

  private subscription: Subscription;

  public get showBreaks() { return this._showBreaks; }
  public set showBreaks(value: boolean) {
    if (value === this._showBreaks) return;
    this._showBreaks = value;
    this.trails.showBreaksOnMap = value;
  }

  constructor(
    readonly trails: TrailsWaypoints,
    public readonly trail: Trail,
    public readonly track: Track,
    public readonly recording: boolean,
    readonly onUpdated: () => void,
  ) {
    this.subscription = track.computedWayPoints$.subscribe(
      wayPoints => {
        const previousHighlighted = trails.highlightedWayPoint;
        const previousHighlightedIndex = previousHighlighted ? this.wayPoints.indexOf(trails.highlightedWayPoint) : -1;
        if (previousHighlightedIndex >= 0) trails.unhighlightWayPoint(previousHighlighted!, true);
        this.wayPoints = wayPoints;
        this.hasBreaks = !!wayPoints.find(wp => wp.breakPoint);
        this.wayPointDepartureAndArrival = this.wayPoints.find(wp => wp.isDeparture && wp.isArrival);
        this.wayPointsImages = this.wayPoints.map(wp => {
          if (wp.isDeparture)
            return MapAnchor.createDataIcon(anchorDepartureBorderColor, trails.i18n.texts.way_points.D, anchorDepartureTextColor, anchorDepartureFillColor);
          if (wp.breakPoint)
            return MapAnchor.createDataIcon(anchorBreakBorderColor, MapTrackWayPoints.breakPointText(wp.breakPoint), anchorBreakTextColor, anchorBreakFillColor);
          if (wp.isArrival && (!recording || wp.isComputedOnly))
            return MapAnchor.createDataIcon(anchorArrivalBorderColor, trails.i18n.texts.way_points.A, anchorArrivalTextColor, anchorArrivalFillColor);
          return MapAnchor.createDataIcon(anchorBorderColor, '' + wp.index, anchorTextColor, anchorFillColor);
        });
        if (this.wayPointDepartureAndArrival)
          this.wayPointsImages.push(MapAnchor.createDataIcon(anchorArrivalBorderColor, trails.i18n.texts.way_points.A, anchorArrivalTextColor, anchorArrivalFillColor));
        // TODO re-highlight way point ?
        onUpdated();
      }
    );
  }

  destroy(): void {
    this.subscription.unsubscribe();
  }

}
