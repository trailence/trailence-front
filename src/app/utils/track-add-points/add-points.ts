import { Injector } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { MapComponent } from '@trailence/components/map/map.component';
import { Track } from '@trailence/model/track';
import { GeoService } from '@trailence/services/geolocation/geo.service';
import { WayUtils } from '@trailence/services/map/way-utils';
import { OfflineMapService } from '@trailence/services/map/offline-map.service';
import { Way, WayPermission } from '@trailence/services/map/way';
import { WaysColor, WaysMapElement } from '@trailence/components/map/elements/ways';
import { EarthPoint } from '@trailence/utils/latlng';
import { MapRenderer } from '@trailence/components/map/impl/map-renderer';
import { AddPointAnchor } from '@trailence/components/map/elements/add-point-anchor';
import { AnyMapElement } from '@trailence/components/map/map-element';
import { RoutingSession, TrackPoint, WayRoutePoint, WaysHelper } from './ways-helper';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { Point } from '@trailence/model/point';

export const ADD_POINTS_MIN_ZOOM = 14;

export interface TrackHistory {
  nbPoints: number;
  latest: TrackPoint;
}

export class AddPoints {

  constructor(
    private readonly injector: Injector,
    private readonly map: MapComponent,
    private readonly track: Track,
    public readonly trackPoints: TrackHistory[],
    private readonly firstTrackPointUndoable: boolean,
    private readonly segmentIndex: number,
    private readonly refreshToolbar: () => void,
    private readonly trackChanged: () => void,
    private readonly elevationChanged: () => void,
  ) {
    this.resume();
  }

  private readonly waysHelper = new WaysHelper({
    snapRadiusMeters: 5,
    startAccessRadiusMeters: 250,
    startSnapToleranceMeters: 5,
    highlightRadiusMeters: 2.5,
    maxHighlightedWays: 10,
  });
  public readonly waysToCursor = {
    normal: new BehaviorSubject<{points: EarthPoint[]}[]>([]),
    permissive: new BehaviorSubject<{points: EarthPoint[]}[]>([]),
    forbidden: new BehaviorSubject<{points: EarthPoint[]}[]>([]),
  };
  private readonly addPointAnchor = new AddPointAnchor();
  public readonly waysMapElements: AnyMapElement[] = [
    new WaysMapElement('ways-to-cursor-normal', this.waysToCursor.normal, WaysColor.NORMAL, 0.5, 3),
    new WaysMapElement('ways-to-cursor-permissive', this.waysToCursor.permissive, WaysColor.PERMISSIVE, 0.5, 3),
    new WaysMapElement('ways-to-cursor-forbidden', this.waysToCursor.forbidden, WaysColor.FORBIDDEN, 0.5, 3),
    this.addPointAnchor,
  ];

  public putAnchors = false;
  public putFreeAnchor = false;

  private readonly mode: 'foot' | 'bicycle' = 'foot'; // TODO

  private routingSession: RoutingSession | undefined;

  public readonly toolbar: MenuItem[] = [
    new MenuItem().setIcon('location').setI18nLabel('pages.trailplanner.put_free_point')
      .setVisible(() => !this.putFreeAnchor)
      .setAction(() => { this.enableFreeAnchor(); }),
    new MenuItem().setIcon('location').setI18nLabel('pages.trailplanner.back_to_non_free_point')
      .setVisible(() => this.putFreeAnchor)
      .setAction(() => { this.backToNonFreeAnchors(); }),
    new MenuItem(),
    new MenuItem().setIcon('undo').setI18nLabel('buttons.undo')
      .setDisabled(() => this.trackPoints.length === 0 || (!this.firstTrackPointUndoable && this.trackPoints.length === 1))
      .setAction(() => { this.undo(); }),
    new MenuItem().setIcon('redo').setI18nLabel('buttons.redo')
      .setDisabled(() => this._redo.length === 0)
      .setAction(() => { this.redo(); }),
  ];

  public mapChanged() {
    this.updateWaysFromMapState();
  }

  private readonly _redo: {
    history: TrackHistory,
    points: Point[],
  }[] = [];

  private undo(): void {
    if (this.trackPoints.length === 0) return;
    if (!this.firstTrackPointUndoable && this.trackPoints.length === 1) return;
    const removed = this.trackPoints.splice(-1, 1)[0];
    const points = this.track.segments.at(this.segmentIndex)!.points;
    const pointsRemoved = points.slice(points.length - removed.nbPoints);
    if (this.trackPoints.length === 1) {
      this.track.removeSegmentAt(0);
      this.routingSession = undefined;
    } else {
      this.track.segments.at(this.segmentIndex)!.removeMany(pointsRemoved);
      if (this.putAnchors) {
        this.routingSession = this.waysHelper.createRoutingSession(this.getLastPoint()!);
      }
    }
    this._redo.push({history: removed, points: pointsRemoved});
    this.trackChanged();
    this.elevationChanged();
    this.refreshToolbar();
  }

  private redo(): void {
    const redo = this._redo.pop();
    if (!redo) return;
    if (this.track.segments.length === 0) this.track.newSegment();
    this.track.segments.at(this.segmentIndex)!.appendMany(redo.points);
    this.trackPoints.push(redo.history);
    this.trackPointAdded(redo.history.nbPoints);
  }

  private firstPoint(point: TrackPoint): void {
    const segment = this.track.newSegment();
    segment.append({pos: point.pos});
    this.trackPoints.push({nbPoints: 1, latest: point});
    this.trackPointAdded(1);
    if (this._redo.length > 0) this._redo.splice(0, this._redo.length);
  }

  private appendPoints(points: TrackPoint[]): void {
    if (points.length === 0) return;
    this.track.segments.at(this.segmentIndex)!.appendMany(points.map(p => ({pos: p.pos})));
    this.trackPoints.push({nbPoints: points.length, latest: points.at(-1)!});
    this.trackPointAdded(points.length);
    if (this._redo.length > 0) this._redo.splice(0, this._redo.length);
  }

  private trackPointAdded(nbPoints: number): void {
    this.addPointAnchor.position = undefined;
    this.setWaysToCursor(undefined);
    if (this.putAnchors) this.routingSession = this.waysHelper.createRoutingSession(this.getLastPoint()!);
    this.trackChanged();
    this.fillElevation(this.track.segments.at(this.segmentIndex)!.points.slice(-nbPoints));
    this.refreshToolbar();
  }

  private getLastPoint(): TrackPoint | undefined {
    return this.trackPoints.at(-1)?.latest;
  }

  private getWayColor(way?: Way): WaysColor {
    if (!way) return WaysColor.NORMAL;
    switch (this.mode) {
      case 'foot':
        switch (way.footPermission) {
          case WayPermission.ALLOWED: return WaysColor.NORMAL;
          case WayPermission.FORBIDDEN: return WaysColor.FORBIDDEN;
          case WayPermission.PERMISSIVE: return WaysColor.PERMISSIVE;
        }
        break;
      case 'bicycle':
        switch (way.bicyclePermission) {
          case WayPermission.ALLOWED: return WaysColor.NORMAL;
          case WayPermission.FORBIDDEN: return WaysColor.FORBIDDEN;
          case WayPermission.PERMISSIVE: return WaysColor.PERMISSIVE;
          case WayPermission.DISMOUNT: return WaysColor.PERMISSIVE; // TODO
        }
        break;
    }
    return WaysColor.NORMAL;
  }

  private anchorMapOverSubscription?: Subscription;
  private anchorMapClickSubscription?: Subscription;

  private enablePutAnchor(): void {
    this.disableFreeAnchor();
    this.putAnchors = true;
    this.updateWaysFromMapState();
    this._latestMousePosition = undefined;
    this.anchorMapOverSubscription = this.map.events.mousePosition.asObservable().subscribe(mouseEvent => {
      this.refreshWaysToMouse(mouseEvent.renderer, mouseEvent.geographicPoint);
    });
    this.anchorMapClickSubscription = this.map.events.click.asObservable().subscribe(mouseEvent => {
      const zoom = this.map.renderer?.mapState?.zoom;
      if (!zoom || zoom < ADD_POINTS_MIN_ZOOM) return;
      if (!this.routingSession) {
        if (this.getLastPoint()) return;
        // first point
        const closest = this.waysHelper.findClosestWayPoint(mouseEvent.geographicPoint);
        if (!closest) return;
        this.firstPoint({pos: closest.pos, free: false});
        return;
      }
      const preview = this.routingSession?.preview(mouseEvent.geographicPoint);
      if (!preview?.snap || !preview.route) return;
      const routePoints = preview.route.points;
      const trackPoints = routePoints.map(p => ({pos: p.pos, free: false} as TrackPoint));
      trackPoints.at(-1)!.network = {
        wayId: preview.snap.wayId,
        segmentIndex: preview.snap.segmentIndex,
        t: preview.snap.t,
      };
      this.appendPoints(trackPoints);
    });
  }

  private _latestMousePosition: EarthPoint | undefined = undefined;
  private refreshWaysToMouse(renderer: MapRenderer | undefined, mousePosition: EarthPoint | undefined): void {
    const mousePos = mousePosition ?? this._latestMousePosition;
    if (!mousePos) {
      this.nothingToGo();
      return;
    }
    const zoom = renderer?.mapState?.zoom;
    if (!zoom || zoom < ADD_POINTS_MIN_ZOOM) {
      this.nothingToGo();
      return;
    }
    if (!this.routingSession) {
      if (this.getLastPoint()) {
        this.nothingToGo();
        return;
      }
      // first point
      const closest = this.waysHelper.findClosestWayPoint(mousePos);
      if (!closest) {
        this.nothingToGo();
        return;
      }
      this.addPointAnchor.position = closest.pos;
      this.setWaysToCursor(undefined);
      // TODO clearHighlightedWays();
      return;
    }
    const preview = this.routingSession.preview(mousePos);
    if (!preview?.snap || !preview.route) {
      this.nothingToGo();
      return;
    }
    this.addPointAnchor.position = preview.snap.pos;
    this.setWaysToCursor(preview.route.points);
    // TODO Highlight the nearby OSM ways.
    //highlightWays(new Set(preview.nearbyWays.map(w => w.wayId)));
  }
  private nothingToGo(): void {
    this.addPointAnchor.position = undefined;
    this.setWaysToCursor(undefined);
    // TODO clearHighlightedWays();
  }

  private setWaysToCursor(path: WayRoutePoint[] | undefined): void {
    let normal: {points: EarthPoint[]}[] = [];
    let permissive: {points: EarthPoint[]}[] = [];
    let forbidden: {points: EarthPoint[]}[] = [];
    if (path) {
      let current: {color: WaysColor, way: {points: EarthPoint[]}} | undefined;
      const pushCurrent = (c: {color: WaysColor, way: {points: EarthPoint[]}}) => {
        switch (c.color) {
          case WaysColor.NORMAL: normal.push(c.way); break;
          case WaysColor.PERMISSIVE: permissive.push(c.way); break;
          case WaysColor.FORBIDDEN: forbidden.push(c.way); break;
        }
      };
      for (const pt of path) {
        let color = WaysColor.NORMAL;
        if (pt.wayId) {
          const way = this.waysHelper.wayById.get(pt.wayId);
          if (way) color = this.getWayColor(way);
        }
        if (!current) {
          current = {color, way: {points: [pt.pos]}};
        } else if (current.color === color) {
          current.way.points.push(pt.pos);
        } else {
          pushCurrent(current);
          current = {color, way: {points: [pt.pos]}};
        }
      }
      if (current) pushCurrent(current);
    }
    const update = (newValue: {points: EarthPoint[]}[], current$: BehaviorSubject<{points: EarthPoint[]}[]>) => {
      if (newValue.length === 0) {
        if (current$.value.length > 0) current$.next([]);
      } else {
        current$.next(newValue);
      }
    };
    update(normal, this.waysToCursor.normal);
    update(permissive, this.waysToCursor.permissive);
    update(forbidden, this.waysToCursor.forbidden);
  }

  private disablePutAnchors(): void {
    this.anchorMapOverSubscription?.unsubscribe();
    this.anchorMapOverSubscription = undefined;
    this.anchorMapClickSubscription?.unsubscribe();
    this.anchorMapClickSubscription = undefined;
    this._latestMousePosition = undefined;
    this.putAnchors = false;
    this.addPointAnchor.position = undefined;
    this.setWaysToCursor(undefined);
  }

  enableFreeAnchor(): void {
    if (!this.putAnchors) return;
    this.disablePutAnchors();
    this.cancelWays();
    this.putFreeAnchor = true;
    this.addPointAnchor.position = undefined;
    const map = this.map;
    if (!map) return;
    this.anchorMapOverSubscription = map.events.mousePosition.asObservable().subscribe(mouseEvent => {
      this.addPointAnchor.position = mouseEvent.geographicPoint;
    });
    this.anchorMapClickSubscription = map.events.click.asObservable().subscribe(mouseEvent => {
      if (!this.getLastPoint()) {
        this.firstPoint({pos: mouseEvent.geographicPoint, free: true});
      } else {
        this.appendPoints([{pos: mouseEvent.geographicPoint, free: true}]);
      }
    });
    this.refreshToolbar();
  }

  private disableFreeAnchor(): void {
    this.anchorMapOverSubscription?.unsubscribe();
    this.anchorMapOverSubscription = undefined;
    this.anchorMapClickSubscription?.unsubscribe();
    this.anchorMapClickSubscription = undefined;
    this.putFreeAnchor = false;
    this.addPointAnchor.position = undefined;
  }

  backToNonFreeAnchors(): void {
    this.enablePutAnchor();
    this.refreshToolbar();
  }

  stop(): void {
    this.disablePutAnchors();
    this.cancelWays();
    this.disableFreeAnchor();
  }

  resume(): void {
    this.backToNonFreeAnchors();
    this.updateWaysFromMapState();
  }

  // --- ways from map ---

  public readonly searchingWays$ = new BehaviorSubject<boolean>(false);

  private updateWaysFromMapState(): void {
    const renderer = this.map?.renderer;
    if (!this.putAnchors || !renderer) return;
    if (renderer.mapState.zoom < ADD_POINTS_MIN_ZOOM) {
      this.cancelWays();
      return;
    }
    this.searchingWays$.next(true);
    this.routingSession = undefined;
    const bounds = renderer.getBounds();
    if (!bounds) {
      setTimeout(() => this.updateWaysFromMapState(), 100);
      return;
    }
    this.injector.get(OfflineMapService)
      .ways.getAllWays(bounds, true)
      .subscribe(allWays => {
          this.updateWaysFromService(WayUtils.mergeWays(allWays.ways, (w1, w2) => this.getWayColor(w1) === this.getWayColor(w2)));
          this.searchingWays$.next(false);
      });
  }

  private updateWaysFromService(ways: Way[]): void {
    void this.waysHelper.setWays(ways)
    .then(() => {
      if (this.putAnchors) {
        const lastPoint = this.getLastPoint();
        if (lastPoint) this.routingSession = this.waysHelper.createRoutingSession(lastPoint);
      }
      this.refreshWaysToMouse(this.map?.renderer, undefined);
    });
  }

  private cancelWays(): void {
    void this.waysHelper.setWays([]);
    this.addPointAnchor.position = undefined;
    this.setWaysToCursor(undefined);
  }

  // --- elevation ---

  private fillElevation(points: Point[]): void {
    this.injector.get(GeoService).fillPointsElevation(points).subscribe(done => {
      if (done > 0) this.elevationChanged();
    });
  }

}
