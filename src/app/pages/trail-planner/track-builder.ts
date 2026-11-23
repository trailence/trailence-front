import { Injector } from '@angular/core';
import { BehaviorSubject, first, Observable, Subscription, switchMap } from 'rxjs';
import { MapComponent } from '@trailence/components/map/map.component';
import { Point } from '@trailence/model/point';
import { PointDescriptor } from '@trailence/model/point-descriptor';
import { Track } from '@trailence/model/track';
import { Trail } from '@trailence/model/trail';
import { AuthService } from '@trailence/services/auth/auth.service';
import { TrackService } from '@trailence/services/database/track.service';
import { TrailService } from '@trailence/services/database/trail.service';
import { PreferencesService } from '@trailence/services/preferences/preferences.service';
import { TrackEditionService } from '@trailence/services/track-edition/track-edition.service';
import { Arrays } from '@trailence/utils/arrays';
import { TrailPlannerPage } from './trail-planner.page';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { TrackUtils } from '@trailence/utils/track-utils';
import { GeoService } from '@trailence/services/geolocation/geo.service';
import { TrackDto } from '@trailence/model/dto/track';
import { TrailSourceType } from '@trailence/model/dto/trail';
import { WayUtils } from '@trailence/services/map/way-utils';
import { SimplifiedPoint, SimplifiedTrackSnapshot } from '@trailence/model/snapshots';
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

const logger = getLogger('track-builder');

const MATCHING_MAX_DISTANCE = 2.5;

const LOCALSTORAGE_KEY_PREFIX = 'trailence.trail-planner.';

interface TrackPoint {
  pos: EarthPoint;
  free: boolean;
}

export class TrackBuilder {

  private ways: Way[] = [];
  private readonly possibleWaysFromCursor = {
    normal: new BehaviorSubject<Way[]>([]),
    permissive: new BehaviorSubject<Way[]>([]),
    forbidden: new BehaviorSubject<Way[]>([]),
  };
  private readonly possibleWaysFromLastWayPoint = {
    normal: new BehaviorSubject<Way[]>([]),
    permissive: new BehaviorSubject<Way[]>([]),
    forbidden: new BehaviorSubject<Way[]>([]),
  };
  private highlightedWays: MapTrack[] = [];
  public waysMapElements = [
    new WaysMapElement('possible-from-cursor-normal', this.possibleWaysFromCursor.normal, WaysColor.NORMAL, 0.5, 3),
    new WaysMapElement('possible-from-cursor-permissive', this.possibleWaysFromCursor.permissive, WaysColor.PERMISSIVE, 0.5, 3),
    new WaysMapElement('possible-from-cursor-forbidden', this.possibleWaysFromCursor.forbidden, WaysColor.FORBIDDEN, 0.5, 3),
    new WaysMapElement('possible-from-last-normal', this.possibleWaysFromLastWayPoint.normal, WaysColor.NORMAL, 0.75, 3),
    new WaysMapElement('possible-from-last-permissive', this.possibleWaysFromLastWayPoint.permissive, WaysColor.PERMISSIVE, 0.75, 3),
    new WaysMapElement('possible-from-last-forbidden', this.possibleWaysFromLastWayPoint.forbidden, WaysColor.FORBIDDEN, 0.75, 3),
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

  start(): void {
    this.track = new Track({owner: this.injector.get(AuthService).email}, false, this.injector.get(PreferencesService), this.injector.get(OfflineMapService), this.injector.get(WorkerService), this.injector.get(TrackComputedDataCacheService), this.injector.get(NetworkService));
    const color = Color.parse(PRIMARY_TRACK_COLOR).setAlpha(0.5);
    this.trackMapElements$.next([
      new MapTrackPath(undefined, this.track, color, false, 3, PATH_ARROWS_DEFAULT_COLOR),
      new MapTrackAnchors(this.track, this.injector.get(I18nService), false, color, undefined, undefined, undefined),
    ]);
    this.enablePutAnchor();
    this.updateWays();
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
    this.updateWays();
  }

  reset(): void {
    if (this.putAnchors)
      this.disablePutAnchors();
    if (this.putFreeAnchor)
      this.disableFreeAnchor();
    this.cancelWays();
    this.trackMapElements$.next(undefined);
    this.track = undefined;
    this.points = [];
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
    if (this.points.length === 0) return;
    if (this.points.length === 1) {
      this.points = [];
      this.start();
    } else {
      if (!this.track) return;
      this.track.lastSegment.removeMany(this.points.at(-1)!);
      this.points.splice(-1, 1);
      this.updateCurrentMapTrack();
      const matching = WayUtils.getMatchingWays(this.getLastPoint()!.pos, this.ways, MATCHING_MAX_DISTANCE);
      this.updateWaysFromLastAnchor(matching);
      this.hasElevation = this.track.forEachPoint(p => p.ele !== undefined) ?? false;
    }
    this.planner.changesDetection.detectChanges();
  }

  private getLastPoint(): TrackPoint | undefined {
    return this.trackPoints.at(-1)?.at(-1);
  }

  public mapChanged() {
    this.updateWays();
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

  private setHighlightedWays(tracks: MapTrack[]): void {
    if (Arrays.sameContent(this.highlightedWays, tracks)) return;
    for (const t of this.highlightedWays) t.color = this.getWayColor(t.data?.element);
    this.highlightedWays = tracks;
    for (const t of this.highlightedWays) {
      t.color = WAY_MAPTRACK_HIGHLIGHTED_COLOR;
      t.bringToFront();
    }
  }


  private anchorMapOverSubscription?: Subscription;
  private anchorMapClickSubscription?: Subscription;
  private _addAnchor?: MapAnchor;

  private enablePutAnchor(): void {
    this.disableFreeAnchor();
    this.putAnchors = true;
    this._addAnchor = this.createAnchor({lat: 0, lng: 0}, '+', false);
    const map = this.map;
    if (!map) return;
    this.anchorMapOverSubscription = map.events.mousePosition.asObservable().subscribe(mouseEvent => {
      const zoom = map.renderer?.mapState?.zoom;
      if (!zoom || zoom < this.planner.minZoom) {
        this.possibleWaysFromCursor.normal.next([]);
        this.possibleWaysFromCursor.permissive.next([]);
        this.possibleWaysFromCursor.forbidden.next([]);
        this.possibleWaysFromLastAnchor.normal.next([]);
        this.possibleWaysFromLastAnchor.permissive.next([]);
        this.possibleWaysFromLastAnchor.forbidden.next([]);
        this.map.removeFromMap(this._addAnchor!.marker);
        this.planner.changesDetection.detectChanges();
        return;
      }
      const ref = this.getEligiblePoint(refs);
      if (ref?.ref?.point) {
        const pos = ref.ref.position!;
        this._addAnchor!.marker.setLatLng(pos);
        this.map.addToMap(this._addAnchor!.marker);

        const matchingWays = WayUtils.getMatchingWays(pos, this.ways, MATCHING_MAX_DISTANCE);
        const matchingMapTracks = this.getMatchingMapTracksIn(pos, [...this.possibleWaysFromLastAnchor$.value, ...this.possibleWaysFromCursor$.value]);
        const missingWays = matchingWays.filter(way => !matchingMapTracks.some(mt => mt.data.element === way));
        // new possible ways from cursor = matchingMapTracks present in current possible ways + missingWays
        const newPossibleWaysFromCursor = this.possibleWaysFromCursor$.value.filter(t => matchingMapTracks.includes(t));
        for (const missing of missingWays)
          newPossibleWaysFromCursor.push(this.wayToMapTrack(missing));
        // map tracks = current - current additional + new additional
        this.possibleWaysFromCursor$.next(newPossibleWaysFromCursor);

        this.setHighlightedWays(matchingMapTracks.filter(t => !newPossibleWaysFromCursor.includes(t)));
      } else {
        this.map.removeFromMap(this._addAnchor!.marker);
        this.setHighlightedWays([]);
        this.possibleWaysFromCursor$.next([]);
      }
      this.planner.changesDetection.detectChanges();
    });
    this.anchorMapClickSubscription = map.events.click.asObservable().subscribe(mouseEvent => {
      const zoom = map.renderer?.mapState?.zoom;
      if (!zoom || zoom < this.planner.minZoom) return;
      const lastPoint = this.getLastPoint();
      if (!lastPoint) {
        const closest = WayUtils.findClosestWayPoint(mouseEvent.geographicPoint, this.ways, MATCHING_MAX_DISTANCE);
        if (!closest) return;
        this.firstPoint({pos: closest.match.point, free: false});
        return;
      }
      const points = this.getBestWayToGoFrom(lastPoint, mouseEvent.geographicPoint);
      this.appendPoints(points);
    });
  }

  private disablePutAnchors(): void {
    this.anchorMapOverSubscription?.unsubscribe();
    this.anchorMapOverSubscription = undefined;
    this.anchorMapClickSubscription?.unsubscribe();
    this.anchorMapClickSubscription = undefined;
    this.putAnchors = false;
    if (this._addAnchor) {
      this.map.removeFromMap(this._addAnchor.marker);
      this._addAnchor = undefined;
    }
    this.highlightedWays = [];
  }

  enableFreeAnchor(): void {
    if (!this.putAnchors) return;
    this.disablePutAnchors();
    this.cancelWays();
    this.putFreeAnchor = true;
    this._addAnchor = this.createAnchor({lat: 0, lng: 0}, '+', false);
    this.map.addToMap(this._addAnchor.marker);
    this.anchorMapOverSubscription = this.map.mouseOver.subscribe(pos => {
      this._addAnchor!.marker.setLatLng(pos);
    });
    this.anchorMapClickSubscription = this.map.mouseClick.subscribe(pos => {
      this.newPoint(pos, undefined);
    });
  }

  private disableFreeAnchor(): void {
    this.anchorMapOverSubscription?.unsubscribe();
    this.anchorMapOverSubscription = undefined;
    this.anchorMapClickSubscription?.unsubscribe();
    this.anchorMapClickSubscription = undefined;
    this.putFreeAnchor = false;
    if (this._addAnchor) {
      this.map.removeFromMap(this._addAnchor.marker);
      this._addAnchor = undefined;
    }
  }

  backToNonFreeAnchors(): void {
    this.disableFreeAnchor();
    this.resume();
  }

  private getBestWayToGoFrom(previous: TrackPoint, newPos: EarthPoint): TrackPoint[] {
    if (previous.free) {
      const closest = WayUtils.findClosestWayPoint(newPos, this.ways, MATCHING_MAX_DISTANCE);
      if (!closest) return [];
      return [{pos: closest.match.point, free: false}];
    }
    const ways = [...this.possibleWaysFromLastWayPoint.normal.value, ...this.possibleWaysFromLastWayPoint.permissive.value, ...this.possibleWaysFromLastWayPoint.forbidden.value];
    const linkToPrevious = WayUtils.getClosestPointsOnWays(previous.pos, ways, MATCHING_MAX_DISTANCE);
    let best: {distance: number, points: EarthPoint[]} | undefined = undefined;
    for (const link of linkToPrevious) {
      const newPoints = this.getPointsToGoTo(previous.pos, newPos, link.way.points);
      if (newPoints.length === 0) continue;
      const d = TrackUtils.distanceBetweenLatLng(newPoints, 0, newPoints.length - 1);
      if (!best || d < best.distance) best = {distance: d, points: newPoints};
    }
    if (best) return best.points.map(pos => ({pos, free: false}));
    return [];
  }

  /*
  private getEligiblePoint(pos: EarthPoint): {point: EarthPoint | undefined, using: Way | undefined} | undefined {
    const previousPos = this.getLastPoint();
    const ways = [...this.possibleWaysFromLastAnchor.normal.value, ...this.possibleWaysFromLastAnchor.permissive.value, ...this.possibleWaysFromLastAnchor.forbidden.value];
    if (!previousPos) {
      const closest = WayUtils.findClosestWayPoint(pos, ways);
      return {point: closest?.match?.point, using: undefined};
    }
    const linkToPrevious = WayUtils.getClosestPointsOnWays(previousPos.pos, ways, MATCHING_MAX_DISTANCE);
    for (const link of linkToPrevious) {
      const from = link.closest.point;
      const newPoints = this.getPointsToGoTo(previousPos.pos, pos, link.way.points);
      const d = TrackUtils.distanceBetween(newPoints, 0, newPoints.length - 1);
    }

    const previousPosMapTracks = this.getMatchingMapTracksIn(previousPos.pos, this.possibleWaysFromLastAnchor$.value);
    const linkToPrevious = refs.filter(r => r.point !== undefined && previousPosMapTracks.includes(r.track)).sort(MapTrackPointReference.distanceComparator);
    let best: {ref: MapTrackPointReference, using: MapTrack | undefined} | undefined = undefined;
    let bestWays: Way[] = [];
    let bestDistance = -1;
    for (const ref of linkToPrevious) {
      const matching = this.getMatchingMapTracksIn(ref.position!, previousPosMapTracks); // NOSONAR
      if (matching.length === 1) {
        const newPoints = this.getPointsToGoTo(previousPos.pos, ref.position!, (matching[0].track as SimplifiedTrackSnapshot).points);
        const distance = TrackUtils.distanceBetween(newPoints, 0, newPoints.length - 1);
        const ways = WayUtils.getMatchingWays(ref.position!, this.ways, MATCHING_MAX_DISTANCE); // NOSONAR
        if (best === undefined || (ways.length > bestWays.length && Arrays.includesAll(ways, bestWays)) || (ways.length === bestWays.length && distance < bestDistance && matching[0] !== best.using)) {
          best = {ref, using: matching[0]};
          bestWays = ways;
          bestDistance = distance;
        }
      }
    }
    if (!best && linkToPrevious.length === 0 && this.points.at(-1)?.length === 1) {
      // seems to be a free point
      return {ref: MapTrackPointReference.closest(refs), using: undefined};
    }
    return best;
  }*/

  private createAnchor(pos: L.LatLngLiteral, text: string, canRotate: boolean): MapAnchor {
    return new MapAnchor(pos, '#d00000', text, undefined, '#ffffff', '#d00000', undefined, canRotate, false);
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
    const lastPoint = this.getLastPoint();
    if (!lastPoint) return;
    if (lastPoint.free) {
      this.possibleWaysFromLastWayPoint.normal.next([]);
      this.possibleWaysFromLastWayPoint.permissive.next([]);
      this.possibleWaysFromLastWayPoint.forbidden.next([]);
    } else {
      const matching = WayUtils.getClosestPointsOnWays(lastPoint.pos, this.ways, MATCHING_MAX_DISTANCE);
      this.possibleWaysFromLastWayPoint.normal.next(matching.filter(m => this.getWayColor(m.way) === WaysColor.NORMAL).map(m => m.way));
      this.possibleWaysFromLastWayPoint.permissive.next(matching.filter(m => this.getWayColor(m.way) === WaysColor.PERMISSIVE).map(m => m.way));
      this.possibleWaysFromLastWayPoint.forbidden.next(matching.filter(m => this.getWayColor(m.way) === WaysColor.FORBIDDEN).map(m => m.way));
    }
    this.updateCurrentMapTrack();
    this.saveToLocalStorage();
    this.planner.changesDetection.detectChanges();
  }

  /*
  private newPoint(pos: EarthPoint, using: Way | undefined): void {
    const previousPos = this.getLastPoint();
    if (!previousPos) {
      // first point
      const segment = this.track!.newSegment();
      this.points.push([ segment.append({pos}) ]);
    } else if (using) {
      this.goTo(previousPos.pos, pos, using.points);
    } else {
      // free point
      this.points.push([ this.track!.lastSegment.append({pos}) ]);
    }
    const matching = WayUtils.getClosestPointsOnWays(pos, this.ways, MATCHING_MAX_DISTANCE).map(w => w.way);
    this.updateWaysFromLastAnchor(matching);
    this.updateCurrentMapTrack();
    this.saveToLocalStorage();
    this.planner.changesDetection.detectChanges();
  }*/

    /*
  private goTo(from: EarthPoint, to: EarthPoint, points: EarthPoint[]): void {
    const newPoints = this.getPointsToGoTo(from, to, points);
    if (newPoints.length > 0)
      this.points.push(this.track!.lastSegment.appendMany(newPoints));
  }*/

  private getPointsToGoTo(from: EarthPoint, to: EarthPoint, points: EarthPoint[]): EarthPoint[] {
    const fromIndexes = TrackUtils.findClosestPoints(from, points, MATCHING_MAX_DISTANCE);
    if (fromIndexes.length === 0) return [];
    const toIndexes = TrackUtils.findClosestPoints(to, points, MATCHING_MAX_DISTANCE);
    if (toIndexes.length === 0) return [];
    let fromIndex = 0;
    let toIndex = 0;
    let distance = -1;
    for (const fromI of fromIndexes) {
      for (const toI of toIndexes) {
        const d = TrackUtils.distanceBetweenLatLng(points, Math.min(fromI, toI), Math.max(fromI, toI));
        if (distance === -1 || d < distance) {
          fromIndex = fromI;
          toIndex = toI;
          distance = d;
        }
      }
    }
    const increment = fromIndex < toIndex ? 1 : -1;
    const result: EarthPoint[] = [];
    for (let i = fromIndex + increment; i != toIndex + increment; i = i + increment) {
      result.push(points[i]);
    }
    return result;
  }


  private updateWaysFromService(ways: Way[]): void {
    this.ways = ways;
    const previousPos = this.getLastPoint();
    if (previousPos) {
      const matching = WayUtils.getMatchingWays(previousPos.pos, this.ways, MATCHING_MAX_DISTANCE);
      if (matching.length === 0)
        this.updateWaysFromLastAnchor(this.ways);
      else
        this.updateWaysFromLastAnchor(matching);
    } else {
      this.updateWaysFromLastAnchor(this.ways);
    }
  }

  public searchingWays = false;

  private updateWays(): void {
    const renderer = this.map?.renderer;
    if (!this.putAnchors || !renderer) return;
    if (renderer.mapState.zoom < this.planner.minZoom) {
      this.cancelWays();
      return;
    }
    this.searchingWays = true;
    const bounds = renderer.getBounds();
    if (!bounds) {
      setTimeout(() => this.updateWays(), 100);
      return;
    }
    this.injector.get(OfflineMapService)
      .ways.getAllWays(bounds, true)
      .subscribe(allWays => {
          this.updateWaysFromService(WayUtils.mergeWays(allWays.ways, (w1, w2) => this.getWayColor(w1) === this.getWayColor(w2)));
          this.searchingWays = false;
      });
  }

  private cancelWays(): void {
    this.ways = [];
    this.possibleWaysFromCursor.normal.next([]);
    this.possibleWaysFromCursor.permissive.next([]);
    this.possibleWaysFromCursor.forbidden.next([]);
    this.possibleWaysFromLastAnchor.normal.next([]);
    this.possibleWaysFromLastAnchor.permissive.next([]);
    this.possibleWaysFromLastAnchor.forbidden.next([]);
    this.highlightedWays = [];
  }

  private updateCurrentMapTrack(): void {
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
      this.updateCurrentMapTrack();
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
