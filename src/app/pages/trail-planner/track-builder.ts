import { ChangeDetectorRef, Injector } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { MapComponent } from 'src/app/components/map/map.component';
import { MapAnchor } from 'src/app/components/map/markers/map-anchor';
import { MapTrack } from 'src/app/components/map/track/map-track';
import { MapTrackPointReference } from 'src/app/components/map/track/map-track-point-reference';
import { Point, PointDescriptor } from 'src/app/model/point';
import { Track } from 'src/app/model/track';
import { Trail } from 'src/app/model/trail';
import { AuthService } from 'src/app/services/auth/auth.service';
import { TrackService } from 'src/app/services/database/track.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { Way, WayPermission } from 'src/app/services/geolocation/way';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { TrackEditionService } from 'src/app/services/track-edition/track-edition.service';
import { Arrays } from 'src/app/utils/arrays';
import { TrailPlannerPage } from './trail-planner.page';
import * as L from 'leaflet';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { SimplifiedPoint, SimplifiedTrackSnapshot } from 'src/app/services/database/track-database';
import { TrackUtils } from 'src/app/utils/track-utils';
import { GeoService } from 'src/app/services/geolocation/geo.service';
import { Console } from 'src/app/utils/console';
import { TrackDto } from 'src/app/model/dto/track';
import { estimateTimeForTrack } from 'src/app/services/track-edition/time/time-estimation';

export const WAY_MAPTRACK_DEFAULT_COLOR = '#0000FF80'
export const WAY_MAPTRACK_HIGHLIGHTED_COLOR = '#000080FF'
export const WAY_MAPTRACK_FORBIDDEN_COLOR = '#B03030FF';
export const WAY_MAPTRACK_PERMISSIVE_COLOR = '#C08000FF';

const MATCHING_MAX_DISTANCE = 2.5;

const LOCALSTORAGE_KEY_PREFIX = 'trailence.trail-planner.';

export class TrackBuilder {

  public ways: Way[] = [];
  public possibleWaysFromCursor$ = new BehaviorSubject<MapTrack[]>([]);
  public possibleWaysFromLastAnchor$ = new BehaviorSubject<MapTrack[]>([]);
  private highlightedWays: MapTrack[] = [];

  public track?: Track;
  public currentMapTrack$ = new BehaviorSubject<MapTrack | undefined>(undefined);
  public estimatedTime = 0;
  public hasElevation = false;

  public anchors: MapAnchor[] = [];
  public anchorsPoints: Point[][] = [];
  public putAnchors = false;
  public putFreeAnchor = false;

  private readonly map: MapComponent;
  private readonly changeDetector: ChangeDetectorRef;

  constructor(
    private readonly injector: Injector,
    private readonly planner: TrailPlannerPage,
  ) {
    this.map = planner.map!;
    this.changeDetector = injector.get(ChangeDetectorRef);
    this.map.ready$.subscribe(
      () => this.loadFromLocalStorage()
    );
  }

  start(): void {
    this.track = new Track({owner: this.injector.get(AuthService).email}, this.injector.get(PreferencesService));
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
    this.track = undefined;
    this.anchors.forEach(a => this.map?.removeFromMap(a.marker));
    this.anchors = [];
    this.anchorsPoints = [];
    this.currentMapTrack$.next(undefined);
    this.estimatedTime = 0;
    this.hasElevation = false;
    this.deleteFromLocalStorage();
  }

  save(collectionUuid: string, trailName: string): Trail {
    const trail = new Trail({owner: this.track!.owner, collectionUuid: collectionUuid, name: trailName, originalTrackUuid: this.track!.uuid, currentTrackUuid: this.track!.uuid});
    this.injector.get(TrackEditionService).computeFinalMetadata(trail, this.track!);
    this.injector.get(TrackService).create(this.track!);
    this.injector.get(TrailService).create(trail);
    return trail;
  }

  undo(): void {
    if (this.anchors.length === 0) return;
    if (this.anchors.length === 1) {
      this.map.removeFromMap(this.anchors[0].marker);
      this.anchors = [];
      this.start();
    } else {
      this.track!.lastSegment.removeMany(this.anchorsPoints[this.anchorsPoints.length - 1]);
      this.anchorsPoints.splice(this.anchorsPoints.length - 1, 1);
      const anchor = this.anchors.splice(this.anchors.length - 1, 1)[0];
      this.map.removeFromMap(anchor.marker);
      this.updateCurrentMapTrack();
      const matching = this.getMatchingWays(this.anchors[this.anchors.length - 1].point);
      this.updateMapTracks(matching);
      this.hasElevation = this.track!.forEachPoint(p => p.ele !== undefined) ?? false;
    }
    this.changeDetector.detectChanges();
  }

  public mapChanged() {
    this.updateWays();
  }

  private getWayColor(way?: Way): string {
    if (way?.permission === WayPermission.FORBIDDEN)
      return WAY_MAPTRACK_FORBIDDEN_COLOR;
    if (way?.permission === WayPermission.PERMISSIVE)
      return WAY_MAPTRACK_PERMISSIVE_COLOR;
    return WAY_MAPTRACK_DEFAULT_COLOR;
  }

  private setHighlightedWays(tracks: MapTrack[]): void {
    this.highlightedWays.forEach(t => t.color = this.getWayColor(t.data?.element));
    this.highlightedWays = tracks;
    this.highlightedWays.forEach(t => {
      t.color = WAY_MAPTRACK_HIGHLIGHTED_COLOR;
      t.bringToFront();
    });
  }


  private anchorMapOverSubscription?: Subscription;
  private anchorMapClickSubscription?: Subscription;
  private _addAnchor?: MapAnchor;

  private enablePutAnchor(): void {
    this.disableFreeAnchor();
    this.putAnchors = true;
    this._addAnchor = this.createAnchor({lat: 0, lng: 0}, '+', false);
    this.anchorMapOverSubscription = this.map.mouseOverPoint.subscribe(refs => {
      if (this.map.getState().zoom < this.planner.minZoom) {
        this.possibleWaysFromCursor$.next([]);
        this.possibleWaysFromLastAnchor$.next([]);
        this.map.removeFromMap(this._addAnchor!.marker);
        this.changeDetector.detectChanges();
        return;
      }
      this.setHighlightedWays([]);
      const ref = this.getEligiblePoint(refs);
      if (!ref?.ref?.point) {
        this.map.removeFromMap(this._addAnchor!.marker);
        this.possibleWaysFromCursor$.next([]);
      } else {
        const pos = ref.ref.position!;
        this._addAnchor!.marker.setLatLng(pos);
        this.map.addToMap(this._addAnchor!.marker);

        const matchingWays = this.getMatchingWays(pos);
        const matchingMapTracks = this.getMatchingMapTracksIn(pos, [...this.possibleWaysFromLastAnchor$.value, ...this.possibleWaysFromCursor$.value]);
        const missingWays = matchingWays.filter(way => !matchingMapTracks.find(mt => mt.data.element === way));
        // new possible ways from cursor = matchingMapTracks present in current possible ways + missingWays
        const newPossibleWaysFromCursor = this.possibleWaysFromCursor$.value.filter(t => !!matchingMapTracks.find(t2 => t == t2));
        for (const missing of missingWays)
          newPossibleWaysFromCursor.push(this.wayToMapTrack(missing));
        // map tracks = current - current additional + new additional
        this.possibleWaysFromCursor$.next(newPossibleWaysFromCursor);

        this.setHighlightedWays(matchingMapTracks.filter(t => newPossibleWaysFromCursor.indexOf(t) < 0));
      }
      this.changeDetector.detectChanges();
    });
    this.anchorMapClickSubscription = this.map.mouseClickPoint.subscribe(refs => {
      if (this.map.getState().zoom < this.planner.minZoom) {
        return;
      }
      const ref = this.getEligiblePoint(refs);
      if (!ref?.ref?.point) return;
      this.newPoint(ref.ref.position!, ref.using); // NOSONAR
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

  private getEligiblePoint(refs: MapTrackPointReference[]): {ref: MapTrackPointReference | undefined, using: MapTrack | undefined} | undefined {
    if (refs.length === 0) return undefined;
    if (this.anchors.length === 0) return {ref: MapTrackPointReference.closest(refs), using: undefined};
    const previousPos = this.anchors[this.anchors.length - 1].point;
    const previousPosMapTracks = this.getMatchingMapTracksIn(previousPos, this.possibleWaysFromLastAnchor$.value);
    const linkToPrevious = refs.filter(r => r.point !== undefined && previousPosMapTracks.indexOf(r.track) >= 0).sort(MapTrackPointReference.distanceComparator);
    let best: {ref: MapTrackPointReference, using: MapTrack | undefined} | undefined = undefined;
    let bestWays: Way[] = [];
    for (const ref of linkToPrevious) {
      const matching = this.getMatchingMapTracksIn(ref.position!, previousPosMapTracks); // NOSONAR
      if (matching.length === 1) {
        const ways = this.getMatchingWays(ref.position!); // NOSONAR
        if (best === undefined || (ways.length > bestWays.length && Arrays.containsAll(ways, bestWays))) {
          best = {ref, using: matching[0]};
          bestWays = ways;
        }
      }
    }
    if (!best && linkToPrevious.length === 0 && ((this.anchorsPoints.length > 0 && this.anchorsPoints[this.anchorsPoints.length - 1].length === 1) || (this.anchorsPoints.length === 0 && this.anchors.length === 1))) {
      // seems to be a free point
      return {ref: MapTrackPointReference.closest(refs), using: undefined};
    }
    return best;
  }

  private getMatchingMapTracksIn(pos: L.LatLngLiteral, tracks: MapTrack[]): MapTrack[] {
    const matching: MapTrack[] = [];
    const p = L.latLng(pos.lat, pos.lng);
    for (const mt of tracks) {
      if (mt.track instanceof Track) {
        if (mt.track.getAllPositions().find(pt => p.distanceTo(pt) <= MATCHING_MAX_DISTANCE)) {
          matching.push(mt);
        }
      } else if (mt.track.points.find(pt => p.distanceTo(pt) <= MATCHING_MAX_DISTANCE)) {
        matching.push(mt);
      }
    }
    return matching;
  }

  private getMatchingWays(pos: L.LatLngLiteral): Way[] {
    const matching: Way[] = [];
    const p = L.latLng(pos.lat, pos.lng);
    for (const way of this.ways) {
      if (way.points.find(pt => p.distanceTo(pt) <= MATCHING_MAX_DISTANCE)) {
        matching.push(way);
      }
    }
    return matching;
  }

  private createAnchor(pos: L.LatLngLiteral, text: string, canRotate: boolean): MapAnchor {
    return new MapAnchor(pos, '#d00000', text, undefined, '#ffffff', '#d00000', undefined, canRotate);
  }

  private newPoint(pos: L.LatLngLiteral, using: MapTrack | undefined): void {
    const anchor = this.createAnchor(pos, '' + (this.anchors.length + 1), true);
    if (this.anchors.length === 0) {
      // first point
      const segment = this.track!.newSegment();
      segment.append({pos});
    } else if (using) {
      const previousPos = this.anchors[this.anchors.length - 1].point;
      const points = (using.track as SimplifiedTrackSnapshot).points;
      this.goTo(previousPos, pos, points);
    } else {
      // free point
      this.anchorsPoints.push([ this.track!.lastSegment.append({pos}) ]);
    }
    this.anchors.push(anchor);
    this.map.addToMap(anchor.marker);
    const matching = this.getMatchingWays(pos);
    this.updateMapTracks(matching);
    this.updateCurrentMapTrack();
    this.saveToLocalStorage();
    this.changeDetector.detectChanges();
  }

  private goTo(from: L.LatLngLiteral, to: L.LatLngLiteral, points: SimplifiedPoint[]): void {
    const fromIndex = TrackUtils.findClosestPoint(from, points, MATCHING_MAX_DISTANCE);
    if (fromIndex < 0) return;
    const toIndex = TrackUtils.findClosestPoint(to, points, MATCHING_MAX_DISTANCE);
    if (toIndex < 0) return;
    const increment = fromIndex < toIndex ? 1 : -1;
    const result: PointDescriptor[] = [];
    for (let i = fromIndex + increment; i != toIndex + increment; i = i + increment) {
      result.push({pos: { lat: points[i].lat, lng: points[i].lng } });
    }
    this.anchorsPoints.push( this.track!.lastSegment.appendMany(result) );
  }


  private updateWaysFromService(ways: Way[]): void {
    this.ways = ways;
    if (this.anchors.length === 0) {
      this.updateMapTracks(this.ways);
    } else {
      const matching = this.getMatchingWays(this.anchors[this.anchors.length - 1].point);
      if (matching.length === 0)
        this.updateMapTracks(this.ways);
      else
        this.updateMapTracks(matching);
    }
  }

  private updateMapTracks(ways: Way[]): void {
    const mapTracks: MapTrack[] = [];
    for (const way of ways) {
      const mt = this.wayToMapTrack(way);
      mapTracks.push(mt);
    }
    this.possibleWaysFromLastAnchor$.next(mapTracks);
    this.possibleWaysFromCursor$.next([]);
    this.highlightedWays = [];
  }

  private wayToMapTrack(way: Way): MapTrack {
    const mapTrack = new MapTrack(
      undefined,
      {
        points: way.points
      },
      this.getWayColor(way), 1, false, this.injector.get(I18nService)
    );
    mapTrack.data = {element: way, type: 'way'};
    return mapTrack;
  }

  private updateWays(): void {
    if (!this.putAnchors) return;
    if (this.map.getState().zoom < this.planner.minZoom) {
      this.cancelWays();
      return;
    }
    this.injector.get(GeoService).findWays(this.map!.getBounds()!).subscribe(ways => this.updateWaysFromService(ways)); // NOSONAR
  }

  private cancelWays(): void {
    this.ways = [];
    this.possibleWaysFromCursor$.next([]);
    this.possibleWaysFromLastAnchor$.next([]);
    this.highlightedWays = [];
  }

  private updateCurrentMapTrack(): void {
    const mt = new MapTrack(
      undefined,
      this.track!,
      '#FF000080',
      1, false, this.injector.get(I18nService)
    );
    mt.showArrowPath();
    this.currentMapTrack$.next(mt);
    this.getElevation().subscribe(() => {
      this.saveToLocalStorage();
      this.estimatedTime = estimateTimeForTrack(this.track!, this.injector.get(PreferencesService).preferences);
      this.hasElevation = this.track!.forEachPoint(p => p.ele !== undefined) ?? false;
      if (this.hasElevation)
        this.planner.updateElevationGraph(this.track!);
    });
  }

  private getElevation(): Observable<any> {
    return this.injector.get(GeoService).fillTrackElevation(this.track!);
  }

  private loadFromLocalStorage(): void {
    const trackInStorage = localStorage.getItem(LOCALSTORAGE_KEY_PREFIX + this.injector.get(AuthService).email + '.track');
    if (!trackInStorage) return;
    const pointsInStorage = localStorage.getItem(LOCALSTORAGE_KEY_PREFIX + this.injector.get(AuthService).email + '.points');
    if (!pointsInStorage) return;
    try {
      const points = JSON.parse(pointsInStorage) as {s: number, p: number}[];
      const dto = JSON.parse(trackInStorage) as Partial<TrackDto>;
      this.track = new Track(dto, this.injector.get(PreferencesService));
      for (let i = 0; i < points.length; ++i) {
        const p = points[i];
        const point = this.track.segments[p.s].points[p.p];
        const a = this.createAnchor(point.pos, '' + (this.anchors.length + 1), true);
        this.anchors.push(a);
        this.map.addToMap(a.marker);
        if (i > 0) {
          const prev = points[i - 1];
          if (p.s != prev.s) this.anchorsPoints.push([]);
          else this.anchorsPoints.push(this.track.segments[p.s].points.slice(prev.p + 1, p.p + 1));
        }
      }
      this.updateCurrentMapTrack();
    } catch (e) {
      Console.warn('Error loading trail planner local storage', e, trackInStorage, pointsInStorage);
      // ignore
    }
  }

  private saveToLocalStorage(): void {
    if (this.track!.segments.length === 0) {
      this.deleteFromLocalStorage();
      return;
    }
    localStorage.setItem(LOCALSTORAGE_KEY_PREFIX + this.injector.get(AuthService).email + '.track', JSON.stringify(this.track!.toDto()));
    const points: {s: number, p: number}[] = [{s: 0, p: 0}];
    let segmentIndex = 0;
    let pointIndex = 0;
    for (const ap of this.anchorsPoints) {
      if (ap.length === 0) {
        segmentIndex++;
        pointIndex = 0;
      } else {
        pointIndex += ap.length;
        points.push({s: segmentIndex, p: pointIndex});
      }
    }
    localStorage.setItem(LOCALSTORAGE_KEY_PREFIX + this.injector.get(AuthService).email + '.points', JSON.stringify(points));
  }

  private deleteFromLocalStorage() {
    localStorage.removeItem(LOCALSTORAGE_KEY_PREFIX + this.injector.get(AuthService).email + '.track');
    localStorage.removeItem(LOCALSTORAGE_KEY_PREFIX + this.injector.get(AuthService).email + '.points');
  }

}
