import { BehaviorSubject, Subscription } from 'rxjs';
import { Track } from 'src/app/model/track';
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
import { OfflineMapService } from 'src/app/services/map/offline-map.service';
import { TrackWayPoint } from 'src/app/utils/track-waypoints/track-waypoint';
import { WayPointFromTrack } from 'src/app/utils/track-waypoints/waypoints-from-track';
import { BreakPoint } from 'src/app/utils/track-waypoints/breakpoints';
import { GuidepostWayPoint } from 'src/app/utils/track-waypoints/guideposts';
import { OsmWayIntersection } from 'src/app/utils/track-waypoints/way-intersection';

export class TrailsWaypoints {

  trails: TrailWaypoints[] = [];
  changes$ = new BehaviorSubject<any>(undefined);

  private _mapTracks: MapTrack[] = [];
  public showBreaksOnMapLocked = false;
  public showWaypointsOnMap = true;

  private photosWithPosition: {photos: Photo[], point: L.LatLngExpression}[] = [];

  constructor(
    private readonly selection: TrailSelection,
    public readonly i18n: I18nService,
    public readonly mapService: OfflineMapService,
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
    this._mapTracks.forEach(mt => mt.showWayPointsAnchors(this.showWaypointsOnMap));
    this.updateElementsShown();
  }

  public updateElementsShown(): void {
    if (this.canShowBreaksOnMap()) {
      const multiple = this.trails.filter(t => t.showBreaks).length > 1;
      for (const mt of this._mapTracks) {
        const t = this.trails.find(twp => twp.trail.owner === mt.trail?.owner && twp.trail.uuid === mt.trail?.uuid);
        if (t) mt.showBreaksAnchors(t.showBreaks ? (multiple ? 'colored' : 'normal') : undefined);
      }
    } else {
      for (const mt of this._mapTracks) mt.showBreaksAnchors(undefined);
    }
    if (this.canShowGuidepostsOnMap()) {
      for (const mt of this._mapTracks) {
        const t = this.trails.find(twp => twp.trail.owner === mt.trail?.owner && twp.trail.uuid === mt.trail?.uuid);
        if (t) mt.showGuideposts(t.showGuideposts);
      }
    } else {
      for (const mt of this._mapTracks) mt.showGuideposts(false);
    }
    this.changes$.next(true);
  }

  public isShowingAllBreaks(): boolean {
    return this.trails.every(t => t.showBreaks);
  }

  public toggleShowAllBreaks(): void {
    const newValue = !this.isShowingAllBreaks();
    this.trails.forEach(t => t._showBreaks = newValue);
    this.updateElementsShown();
  }

  public toggleShowWaypointsOnMap(): void {
    this.showWaypointsOnMap = !this.showWaypointsOnMap;
    this._mapTracks.forEach(mt => mt.showWayPointsAnchors(this.showWaypointsOnMap));
  }

  public isShowingAllGuideposts(): boolean {
    return this.trails.every(t => t.showGuideposts);
  }

  public toggleShowAllGuideposts(): void {
    const newValue = !this.isShowingAllGuideposts();
    this.trails.forEach(t => t._showGuideposts = newValue);
    this.updateElementsShown();
  }

  public isShowingAllIntersections(): boolean {
    return this.trails.every(t => t.showIntersections);
  }

  public toggleShowAllIntersections(): void {
    const newValue = !this.isShowingAllIntersections();
    this.trails.forEach(t => t._showIntersections = newValue);
    this.updateElementsShown();
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
    return this.trails.some(t => t.hasBreaks) && !this.showBreaksOnMapLocked;
  }

  public canShowGuidepostsOnMap(): boolean {
    return this.trails.some(t => t.hasGuideposts) && !this.showBreaksOnMapLocked;
  }

  public canShowWaypointsOnMap(): boolean {
    return this.trails.some(
      t => t.wayPoints.some(wp => {
        if (GuidepostWayPoint.from(wp.waypoint)) return true;
        const twp = WayPointFromTrack.from(wp.waypoint);
        return twp && !twp.isDeparture && !twp.isArrival;
      })
    );
  }

  private wayPointsUpdated(): void {
    this.changes$.next(true);
  }

  _highlightedWayPoint?: TrackWayPoint;
  private _highlightedWayPointFromClick = false;

  public get highlightedWayPoint() { return this._highlightedWayPoint; }
  public get highlightedWayPointFromClick() { return this._highlightedWayPointFromClick; }

  highlightWayPoint(wp: TrackWayPoint, click: boolean): void {
    const trail = this.trails.find(t => t.wayPoints.some(w => w.waypoint === wp));
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

  private waypointClick(wp: TrackWayPoint, trail: TrailWaypoints | undefined): void {
    const twp = WayPointFromTrack.from(wp);
    if (trail && twp) {
      const pathPoint = twp.getPoint();
      if (pathPoint && samePositionRound(pathPoint.pos, twp.wayPoint.point.pos)) {
        this.selection.selectPoint([new PointReference(trail.track, twp.nearestTrackPoint!.segmentIndex, twp.nearestTrackPoint!.pointIndex)]);
      }
      this.selection.selectedWayPoint$.next(twp.wayPoint);
    } else {
      this.selection.selectedWayPoint$.next(undefined);
    }
  }

  unhighlightWayPoint(wp: TrackWayPoint, force: boolean): boolean {
    if (this._highlightedWayPoint === wp && (force || !this._highlightedWayPointFromClick)) {
      this._highlightedWayPoint = undefined;
      this._highlightedWayPointFromClick = false;
      if (this.selection.selectedWayPoint$.value === WayPointFromTrack.from(wp)?.wayPoint)
        this.selection.selectedWayPoint$.next(undefined);
      const trail = this.trails.find(t => t.wayPoints.some(w => w.waypoint === wp));
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

  wayPoints: WayPointWithPhotos[] = [];
  wayPointDepartureAndArrival?: WayPointWithPhotos;
  wayPointsImages: (string | undefined)[] = [];
  intersectionsImages: (SVGSVGElement | undefined)[] = [];
  hasBreaks = false;
  _showBreaks = false;
  hasGuideposts = false;
  _showGuideposts = false;
  hasIntersections = false;
  _showIntersections = false;

  private readonly subscription: Subscription;

  public get showBreaks() { return this._showBreaks; }
  public set showBreaks(value: boolean) {
    if (value === this._showBreaks || this.trails.showBreaksOnMapLocked) return;
    this._showBreaks = value;
    this.trails.updateElementsShown();
  }

  public get showGuideposts() { return this._showGuideposts; }
  public set showGuideposts(value: boolean) {
    if (value === this._showGuideposts || this.trails.showBreaksOnMapLocked) return;
    this._showGuideposts = value;
    this.trails.updateElementsShown();
  }

  public get showIntersections() { return this._showIntersections; }
  public set showIntersections(value: boolean) {
    if (value === this._showIntersections || this.trails.showBreaksOnMapLocked) return;
    this._showIntersections = value;
    this.trails.updateElementsShown();
  }

  public isShown(wp: WayPointWithPhotos) {
    if (WayPointFromTrack.from(wp.waypoint)) return true;
    if (this._showBreaks && BreakPoint.from(wp.waypoint)) return true;
    if (this._showGuideposts && GuidepostWayPoint.from(wp.waypoint)) return true;
    if (this._showIntersections && OsmWayIntersection.from(wp.waypoint)) return true;
    return false;
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
    this.subscription = track.computed.wayPoints$.subscribe(
      wayPoints => {
        const previousHighlighted = trails.highlightedWayPoint;
        const previousHighlightedIndex = previousHighlighted ? this.wayPoints.findIndex(w => w.waypoint === trails.highlightedWayPoint) : -1;
        if (previousHighlightedIndex >= 0) trails.unhighlightWayPoint(previousHighlighted!, true);
        this.wayPoints = wayPoints.map(wp => new WayPointWithPhotos(wp, this.getPhotos(this.currentPhotos, wp.position)));
        this.hasBreaks = this.wayPoints.some(wp => !!wp.breakPoint);
        this.hasGuideposts = this.wayPoints.some(wp => !!wp.guidepost);
        this.hasIntersections = this.wayPoints.some(wp => !!wp.intersection);
        this.wayPointDepartureAndArrival = this.wayPoints.find(wp => wp.trackWayPoint?.isDepartureAndArrival());
        this.wayPointsImages = this.wayPoints.map(wp => {
          if (wp.trackWayPoint?.isDeparture)
            return MapAnchor.createDataIcon(anchorDepartureBorderColor, trails.i18n.texts.way_points.D, anchorDepartureTextColor, anchorDepartureFillColor);
          if (wp.trackWayPoint?.isArrival && (!recording || wp.trackWayPoint?.isComputedOnly))
            return MapAnchor.createDataIcon(anchorArrivalBorderColor, trails.i18n.texts.way_points.A, anchorArrivalTextColor, anchorArrivalFillColor);
          if (wp.trackWayPoint)
            return MapAnchor.createDataIcon(anchorBorderColor, '' + wp.trackWayPoint.index, anchorTextColor, anchorFillColor);
          if (wp.breakPoint)
            return MapAnchor.createDataIcon(anchorBreakBorderColor, MapTrackWayPoints.breakPointText(wp.breakPoint), anchorBreakTextColor, anchorBreakFillColor);
          return undefined;
        });
        if (this.wayPointDepartureAndArrival)
          this.wayPointsImages.push(MapAnchor.createDataIcon(anchorArrivalBorderColor, trails.i18n.texts.way_points.A, anchorArrivalTextColor, anchorArrivalFillColor));
        this.intersectionsImages = this.wayPoints.map(wp => wp.intersection?.toSvg('red'))
        onUpdated();
      }
    );
  }

  public updatePhotos(photosWithPosition: {photos: Photo[], point: L.LatLngExpression}[]): boolean {
    this.currentPhotos = photosWithPosition;
    let changed = false;
    for (const w of this.wayPoints) {
      const newPhotos = this.getPhotos(photosWithPosition, w.waypoint.position);
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

export class WayPointWithPhotos {
  constructor(
    public readonly waypoint: TrackWayPoint,
    public photos: Photo[],
  ) {
    this.trackWayPoint = WayPointFromTrack.from(waypoint);
    this.breakPoint = BreakPoint.from(waypoint);
    this.guidepost = GuidepostWayPoint.from(waypoint);
    this.intersection = OsmWayIntersection.from(waypoint);
  }

  public readonly trackWayPoint: WayPointFromTrack | undefined;
  public readonly breakPoint: BreakPoint | undefined;
  public readonly guidepost: GuidepostWayPoint | undefined;
  public readonly intersection: OsmWayIntersection | undefined;
}
