import { Injector } from '@angular/core';
import { BehaviorSubject, first, Observable, Subscription } from 'rxjs';
import { MapComponent } from '@trailence/components/map/map.component';
import { Track } from '@trailence/model/track';
import { Trail } from '@trailence/model/trail';
import { AuthService } from '@trailence/services/auth/auth.service';
import { TrackService } from '@trailence/services/database/track.service';
import { TrailService } from '@trailence/services/database/trail.service';
import { PreferencesService } from '@trailence/services/preferences/preferences.service';
import { TrackEditionService } from '@trailence/services/track-edition/track-edition.service';
import { TrailPlannerPage } from './trail-planner.page';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { GeoService } from '@trailence/services/geolocation/geo.service';
import { TrailSourceType } from '@trailence/model/dto/trail';
import { WaysGraph, WaysPath, WayUtils } from '@trailence/services/map/way-utils';
import { OfflineMapService } from '@trailence/services/map/offline-map.service';
import { Way, WayPermission } from '@trailence/services/map/way';
import { WorkerService } from '@trailence/worker/web-app';
import { TrackComputedDataCacheService } from '@trailence/services/database/track-computed-data-cache.service';
import { NetworkService } from '@trailence/services/network/network.service';
import { TrailCollection } from '@trailence/model/trail-collection';
import { getLogger } from '@trailence/utils/console';
import { MapTrackPath, PATH_ARROWS_DEFAULT_COLOR } from '@trailence/components/map/elements/map-track-path';
import { MapTrackAnchors } from '@trailence/components/map/elements/map-track-anchors';
import { Color } from '@trailence/utils/color';
import { filterDefined } from '@trailence/utils/rxjs/filter-defined';
import { WaysColor, WaysMapElement } from '@trailence/components/map/elements/ways';
import { PRIMARY_TRACK_COLOR } from '@trailence/components/trail/trail-colors';
import { EarthPoint } from '@trailence/utils/latlng';
import { MapRenderer } from '@trailence/components/map/impl/map-renderer';
import { AddPointAnchor } from '@trailence/components/map/elements/add-point-anchor';
import { AnyMapElement } from '@trailence/components/map/map-element';

const logger = getLogger('track-builder');

const MATCHING_MAX_DISTANCE = 2.5;

const LOCALSTORAGE_KEY_PREFIX = 'trailence.trail-planner.';

interface TrackPoint {
  pos: EarthPoint;
  free: boolean;
}

export class TrackBuilder {

  private ways: Way[] = [];
  private readonly graph = new WaysGraph();
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

  public track?: Track;
  public readonly trackMapElements$ = new BehaviorSubject<[MapTrackPath, MapTrackAnchors] | undefined>(undefined);
  public estimatedTime = 0;
  public hasElevation = false;

  public trackPoints: TrackPoint[][] = [];
  public putAnchors = false;
  public putFreeAnchor = false;

  private mode: 'foot' | 'bicycle' = 'foot'; // TODO

  private map?: MapComponent;

  constructor(
    private readonly injector: Injector,
    private readonly planner: TrailPlannerPage,
  ) {
  }

  setMap(map: MapComponent): void {
    this.map = map;
    map.renderer$.pipe(
      filterDefined(),
      first(),
    ).subscribe(
      () => this.loadFromLocalStorage()
    );
  }

  private mapElementFromTrack(): void {
    if (!this.track) return;
    const color = Color.parse(PRIMARY_TRACK_COLOR).setAlpha(0.5);
    this.trackMapElements$.next([
      new MapTrackPath(undefined, this.track, color, false, 3, PATH_ARROWS_DEFAULT_COLOR),
      new MapTrackAnchors(this.track, this.injector.get(I18nService), false, color, undefined, undefined, undefined),
    ]);
  }

  start(): void {
    this.track = new Track({owner: this.injector.get(AuthService).email}, false, this.injector.get(PreferencesService), this.injector.get(OfflineMapService), this.injector.get(WorkerService), this.injector.get(TrackComputedDataCacheService), this.injector.get(NetworkService));
    this.mapElementFromTrack();
    this.enablePutAnchor();
    this.updateWaysFromMapState();
    this.saveToLocalStorage();
    this.estimatedTime = 0;
    this.hasElevation = false;
  }

  stop(): void {
    this.disablePutAnchors();
    this.cancelWays();
    this.disableFreeAnchor();
  }

  resume(): void {
    this.enablePutAnchor();
    this.updateWaysFromMapState();
  }

  reset(): void {
    if (this.putAnchors)
      this.disablePutAnchors();
    if (this.putFreeAnchor)
      this.disableFreeAnchor();
    this.cancelWays();
    this.trackMapElements$.next(undefined);
    this.track = undefined;
    this.trackPoints = [];
    this.estimatedTime = 0;
    this.hasElevation = false;
    this.deleteFromLocalStorage();
  }

  save(collection: TrailCollection, trailName: string): Trail {
    if (!this.track) throw new Error('Unexpected');
    const user = this.track.owner;
    const track = this.track.owner !== collection.getContentOwner() ? this.track.copy(collection.getContentOwner()) : this.track;
    const trail = new Trail({
      owner: track.owner,
      collectionUuid: collection.uuid,
      name: trailName,
      originalTrackUuid: track.uuid,
      currentTrackUuid: track.uuid,
      sourceType: TrailSourceType.TRAILENCE_PLANNER,
      source: user,
      sourceDate: Date.now(),
    });
    this.injector.get(TrackEditionService).computeFinalMetadata(trail, track);
    this.injector.get(TrackService).create(track);
    this.injector.get(TrailService).create(trail);
    return trail;
  }

  undo(): void {
    if (this.trackPoints.length === 0) return;
    if (this.trackPoints.length === 1) {
      this.trackPoints = [];
      this.start();
    } else {
      if (!this.track) return;
      const nbRemoved = this.trackPoints.splice(-1, 1)[0].length;
      const points = this.track.lastSegment.points;
      this.track.lastSegment.removeMany(points.slice(points.length - nbRemoved));
      if (this.putAnchors) this.refreshWaysToMouse(this.map?.renderer, undefined);
      this.hasElevation = this.track.forEachPoint(p => p.ele !== undefined) ?? false;
    }
    this.planner.changesDetection.detectChanges();
  }

  private getLastPoint(): TrackPoint | undefined {
    return this.trackPoints.at(-1)?.at(-1);
  }

  public mapChanged() {
    this.updateWaysFromMapState();
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
    this._latestMousePosition = undefined;
    const map = this.map;
    if (!map) return;
    this.anchorMapOverSubscription = map.events.mousePosition.asObservable().subscribe(mouseEvent => {
      this.refreshWaysToMouse(mouseEvent.renderer, mouseEvent.geographicPoint);
    });
    this.anchorMapClickSubscription = map.events.click.asObservable().subscribe(mouseEvent => {
      const zoom = map.renderer?.mapState?.zoom;
      if (!zoom || zoom < this.planner.minZoom) return;
      this.createWayAnchorPoint(mouseEvent.geographicPoint);
    });
  }

  private _latestMousePosition: EarthPoint | undefined = undefined;
  private refreshWaysToMouse(renderer: MapRenderer | undefined, mousePosition: EarthPoint | undefined): void {
    const mousePos = mousePosition ?? this._latestMousePosition;
    const zoom = renderer?.mapState?.zoom;
    const closest = zoom && zoom >= this.planner.minZoom && mousePos ? WayUtils.findClosestWayPoint(mousePos, this.ways, MATCHING_MAX_DISTANCE) : undefined;
    if (!closest) {
      this.addPointAnchor.position = undefined;
      this.setWaysToCursor(undefined);
      this.planner.changesDetection.detectChanges();
      return;
    }
    const lastPoint = this.getLastPoint();
    if (lastPoint) {
      const path = this.getPathToGoTo(lastPoint, closest.match.point);
      if (!path) {
        this.addPointAnchor.position = undefined;
        this.setWaysToCursor(undefined);
        this.planner.changesDetection.detectChanges();
        return;
      }
      this.addPointAnchor.position = closest.match.point;
      this.setWaysToCursor(path);
    } else {
      this.addPointAnchor.position = closest.match.point;
    }
    this.planner.changesDetection.detectChanges();
  }

  private createWayAnchorPoint(position: EarthPoint): void {
    const closest = WayUtils.findClosestWayPoint(position, this.ways, MATCHING_MAX_DISTANCE);
    if (!closest) return;

    const lastPoint = this.getLastPoint();
    if (!lastPoint) {
      this.firstPoint({pos: closest.match.point, free: false});
      return;
    }
    const path = this.getPathToGoTo(lastPoint, closest.match.point);
    if (!path) return;
    const newPoints: TrackPoint[] = [
      ...path.startingFreePoints.map(pos => ({pos, free: true})),
      ...path.waysPath.map(wp => ({pos: wp.point, free: false})),
    ];
    this.appendPoints(newPoints);
  }

  private setWaysToCursor(path: WaysPath | undefined): void {
    let normal: {points: EarthPoint[]}[] = [];
    let permissive: {points: EarthPoint[]}[] = [];
    let forbidden: {points: EarthPoint[]}[] = [];
    if (path) {
      if (path.startingFreePoints.length > 0) {
        normal.push({points: path.startingFreePoints});
      }
      let current: {color: WaysColor, way: {points: EarthPoint[]}} | undefined;
      const pushCurrent = (c: {color: WaysColor, way: {points: EarthPoint[]}}) => {
        switch (c.color) {
          case WaysColor.NORMAL: normal.push(c.way); break;
          case WaysColor.PERMISSIVE: permissive.push(c.way); break;
          case WaysColor.FORBIDDEN: forbidden.push(c.way); break;
        }
      };
      for (const w of path.waysPath) {
        const color = this.getWayColor(w.way);
        if (!current) {
          current = {color, way: {points: [w.point]}};
        } else if (current.color === color) {
          current.way.points.push(w.point);
        } else {
          pushCurrent(current);
          current = {color, way: {points: [w.point]}};
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
    this.disableFreeAnchor();
    this.resume();
  }

  private getPathToGoTo(lastPoint: TrackPoint, target: EarthPoint): WaysPath | undefined {
    if (lastPoint.free) {
      // TODO threshold should be different i guess
      return this.graph.getShortestPathFromFreePoint(lastPoint.pos, target, MATCHING_MAX_DISTANCE);
    } else {
      const points = this.graph.getShortestPath(lastPoint.pos, target);
      if (!points) return undefined;
      return { startingFreePoints: [], waysPath: points };
    }
  }

  private firstPoint(point: TrackPoint): void {
    const segment = this.track!.newSegment();
    segment.append({pos: point.pos});
    this.trackPoints.push([point]);
    this.trackPointAdded();
  }

  private appendPoints(points: TrackPoint[]): void {
    if (points.length === 0) return;
    this.track!.lastSegment.appendMany(points.map(p => ({pos: p.pos})));
    this.trackPoints.push(points);
    this.trackPointAdded();
  }

  private trackPointAdded(): void {
    this.fillElevation();
    this.saveToLocalStorage();
    this.addPointAnchor.position = undefined;
    this.setWaysToCursor(undefined);
    this.planner.changesDetection.detectChanges();
  }

  // --- ways from map ---

  public searchingWays = false;

  private updateWaysFromMapState(): void {
    const renderer = this.map?.renderer;
    if (!this.putAnchors || !renderer) return;
    if (renderer.mapState.zoom < this.planner.minZoom) {
      this.cancelWays();
      return;
    }
    this.searchingWays = true;
    const bounds = renderer.getBounds();
    if (!bounds) {
      setTimeout(() => this.updateWaysFromMapState(), 100);
      return;
    }
    this.injector.get(OfflineMapService)
      .ways.getAllWays(bounds, true)
      .subscribe(allWays => {
          this.updateWaysFromService(WayUtils.mergeWays(allWays.ways, (w1, w2) => this.getWayColor(w1) === this.getWayColor(w2)));
          this.searchingWays = false;
      });
  }

  private updateWaysFromService(ways: Way[]): void {
    this.ways = ways;
    this.graph.setWays(ways);
    if (this.putAnchors) this.refreshWaysToMouse(this.map?.renderer, undefined);
  }

  private cancelWays(): void {
    this.ways = [];
    this.graph.setWays([]);
    this.addPointAnchor.position = undefined;
    this.setWaysToCursor(undefined);
  }

  // --- elevation ---

  private fillElevation(): void {
    this.getElevation().subscribe(() => {
      this.saveToLocalStorage();
      this.estimatedTime = this.track!.computed.timeEstimationSnapshot.total;
      this.hasElevation = this.track!.forEachPoint(p => p.ele !== undefined) ?? false;
      if (this.hasElevation)
        this.planner.updateGraph(this.track!);
    });
  }

  private getElevation(): Observable<any> {
    return this.injector.get(GeoService).fillTrackElevation(this.track!);
  }

  // --- local storage ---

  private loadFromLocalStorage(): void {
    const str = localStorage.getItem(this.getLocalStorageKey());
    if (!str) return;
    try {
      const json = JSON.parse(str);
      if (!json['track'] || !json['points']) return;
      const points = json['points'];
      if (!Array.isArray(points)) return;
      for (const p of points) if (!p['pos'] || typeof p['pos']['lat'] !== 'number' || typeof p['pos']['lng'] !== 'number' || typeof p['free'] !== 'boolean') return;
      this.track = new Track(json['track'], false, this.injector.get(PreferencesService), this.injector.get(OfflineMapService), this.injector.get(WorkerService), this.injector.get(TrackComputedDataCacheService), this.injector.get(NetworkService));
      this.trackPoints = points;
      this.mapElementFromTrack();
    } catch (e) {
      logger.warn('Error loading trail planner local storage', e, str);
    }
  }

  private saveToLocalStorage(): void {
    if (!this.track) return;
    if (this.track.segments.length === 0) {
      this.deleteFromLocalStorage();
      return;
    }
    localStorage.setItem(this.getLocalStorageKey(), JSON.stringify({
      track: this.track.toDto(),
      points: this.trackPoints,
    }));
  }

  private deleteFromLocalStorage(): void {
    localStorage.removeItem(this.getLocalStorageKey());
  }

  private getLocalStorageKey(): string {
    return LOCALSTORAGE_KEY_PREFIX + this.injector.get(AuthService).email;
  }

}
