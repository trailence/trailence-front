import { CommonModule } from '@angular/common';
import { Component, Injector } from '@angular/core';
import { BehaviorSubject, combineLatest, debounceTime, filter, first, map, Observable, Subscription } from 'rxjs';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { MapState } from 'src/app/components/map/map-state';
import { MapComponent } from 'src/app/components/map/map.component';
import { MapAnchor } from 'src/app/components/map/markers/map-anchor';
import { MapTrack } from 'src/app/components/map/track/map-track';
import { Point } from 'src/app/model/point';
import { SimplifiedPoint, SimplifiedTrackSnapshot } from 'src/app/services/database/track-database';
import { HttpService } from 'src/app/services/http/http.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { AbstractPage } from 'src/app/utils/component-utils';
import { IonButton, IonIcon, IonList, IonItem, IonToggle, IonLabel, IonCheckbox, IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonFooter, IonButtons, IonInput, IonSelect, IonSelectOption, ModalController } from "@ionic/angular/standalone";
import { Track } from 'src/app/model/track';
import { AuthService } from 'src/app/services/auth/auth.service';
import { MapTrackPointReference } from 'src/app/components/map/track/map-track-point-reference';
import { Arrays } from 'src/app/utils/arrays';
import { TrackDto } from 'src/app/model/dto/track';
import { TrackUtils } from 'src/app/utils/track-utils';
import * as L from 'leaflet';
import { estimateTimeForTrack } from 'src/app/services/track-edition/time/time-estimation';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SearchPlaceComponent } from 'src/app/components/search-place/search-place.component';
import { Place } from 'src/app/services/geolocation/place';
import { FormsModule } from '@angular/forms';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { TrailCollection, TrailCollectionType } from 'src/app/model/trail-collection';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { Trail } from 'src/app/model/trail';
import { TrackService } from 'src/app/services/database/track.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { Router } from '@angular/router';
import { ElevationGraphComponent } from 'src/app/components/elevation-graph/elevation-graph.component';
import { Way, WayPermission } from 'src/app/services/geolocation/way';
import { RouteCircuit } from 'src/app/services/geolocation/route';
import { GeoService } from 'src/app/services/geolocation/geo.service';
import { OsmcSymbolService } from 'src/app/services/geolocation/osmc-symbol.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';

const MIN_ZOOM = 14;

const WAY_MAPTRACK_DEFAULT_COLOR = '#0000FF80'
const WAY_MAPTRACK_HIGHLIGHTED_COLOR = '#000080FF'
const WAY_MAPTRACK_FORBIDDEN_COLOR = '#B03030FF';
const WAY_MAPTRACK_PERMISSIVE_COLOR = '#C08000FF';
const ROUTE_MAPTRACK_DEFAULT_COLOR = '#FF00FF80';
const ROUTE_MAPTRACK_HIGHLIGHTED_COLOR = '#A08000FF';

const LOCALSTORAGE_KEY_PREFIX = 'trailence.trail-planner.';

const MATCHING_MAX_DISTANCE = 2.5;

@Component({
  selector: 'app-trail-planner',
  templateUrl: './trail-planner.page.html',
  styleUrls: ['./trail-planner.page.scss'],
  standalone: true,
  imports: [IonSelect, IonSelectOption, IonInput, IonButtons, IonFooter, IonContent, IonTitle, IonToolbar, IonHeader, IonModal, IonCheckbox, IonLabel, IonToggle, IonItem, IonList,
    IonIcon, IonButton, HeaderComponent, MapComponent, CommonModule, SearchPlaceComponent, FormsModule, ElevationGraphComponent]
})
export class TrailPlannerPage extends AbstractPage {

  ways: Way[] = [];
  routes: RouteCircuit[] = [];

  currentMapTrack$ = new BehaviorSubject<MapTrack | undefined>(undefined);
  possibleWaysFromCursor$ = new BehaviorSubject<MapTrack[]>([]);
  possibleWaysFromLastAnchor$ = new BehaviorSubject<MapTrack[]>([]);

  routesMapTracks$ = new BehaviorSubject<MapTrack[]>([]);

  mapTracks$: Observable<MapTrack[]>;

  mapState?: MapState;
  minZoom = MIN_ZOOM;

  private map?: MapComponent;

  anchors: MapAnchor[] = [];
  anchorsPoints: Point[][] = [];
  track?: Track;
  putAnchors = false;
  showRoutes = false;
  estimatedTime = 0;
  putFreeAnchor = false;

  trailName = '';
  collectionUuid?: string;
  collections: TrailCollection[] = [];

  constructor(
    injector: Injector,
    public i18n: I18nService,
    private http: HttpService,
    collectionService: TrailCollectionService,
    private geo: GeoService,
  ) {
    super(injector);
    this.mapTracks$ = combineLatest([this.currentMapTrack$, this.possibleWaysFromLastAnchor$, this.possibleWaysFromCursor$, this.routesMapTracks$]).pipe(
      debounceTime(10),
      map(([currentTrack, list1, list2, list3]) => {
        const all = [...list1, ...list2, ...list3];
        if (currentTrack) all.push(currentTrack);
        this.updateLegend();
        return all;
      })
    );
    this.whenAlive.add(collectionService.getAll$().pipe(
      collection$items(),
    ).subscribe(
      collections => this.collections = collections
    ))
  }

  protected override initComponent(): void {
    this._children$.pipe(
      map(children => children.find(child => child instanceof MapComponent)),
      filter(map => !!map),
      first()
    ).subscribe(map => {
      this.map = map! as MapComponent;
      this.mapState = this.map.getState();
      this.whenVisible.subscribe(
        combineLatest([this.mapState.center$, this.mapState.zoom$]).pipe(debounceTime(200)),
        () => {
          this.updateWays();
          this.updateRoutes();
        }
      );
      this.map.ready$.subscribe(
        () => this.loadFromLocalStorage()
      );
    });
  }

  getCollectionName(collection: TrailCollection): string {
    if (collection.name.length === 0 && collection.type === TrailCollectionType.MY_TRAILS)
      return this.i18n.texts.my_trails;
    return collection.name;
  }

  goToPlace(place: Place): void {
    this.map?.goTo(place.lat, place.lng, 14);
  }

  start(): void {
    this.track = new Track({owner: this.injector.get(AuthService).email}, this.injector.get(PreferencesService));
    this.enablePutAnchor();
    this.updateWays();
    this.saveToLocalStorage();
    this.estimatedTime = 0;
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
    this.trailName = '';
    this.collectionUuid = undefined;
    this.deleteFromLocalStorage();
  }

  save(): void {
    const trail = new Trail({owner: this.track!.owner, collectionUuid: this.collectionUuid!, name: this.trailName, originalTrackUuid: this.track!.uuid, currentTrackUuid: this.track!.uuid});
    this.injector.get(TrackService).create(this.track!);
    this.injector.get(TrailService).create(trail);
    this.reset();
    this.injector.get(Router).navigateByUrl('/trail/' + encodeURIComponent(trail.owner) + '/' + encodeURIComponent(trail.uuid));
    this.injector.get(ModalController).dismiss(null, 'ok');
  }

  private highlightedWays: MapTrack[] = [];
  private highlightedRoutes: MapTrack[] = [];
  highlightedRoute?: RouteCircuit;

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

  private setHighlightedRoutes(tracks: MapTrack[]): void {
    this.highlightedRoutes.forEach(t => t.color = ROUTE_MAPTRACK_DEFAULT_COLOR);
    this.highlightedRoutes = tracks;
    this.highlightedRoutes.forEach(t => {
      t.color = ROUTE_MAPTRACK_HIGHLIGHTED_COLOR;
      t.bringToFront();
    });
  }

  toggleShowRoutes(enabled: boolean): void {
    this.showRoutes = enabled;
    this.updateRoutes();
  }

  toggleHighlightRoute(route: RouteCircuit): void {
    if (this.highlightedRoute === route) {
      this.highlightedRoute = undefined;
      this.setHighlightedRoutes([]);
    } else {
      this.highlightedRoute = route;
      this.setHighlightedRoutes(this.routesMapTracks$.value.filter(t => t.data?.element === route));
    }
  }

  private updateLegend(): void {
    const legend = document.getElementById('trail-planner-legend');
    if (!legend) return;
    const hasPermissive = !!this.possibleWaysFromCursor$.value.find(t => t.color === WAY_MAPTRACK_PERMISSIVE_COLOR) ||
                          !!this.possibleWaysFromLastAnchor$.value.find(t => t.color === WAY_MAPTRACK_PERMISSIVE_COLOR);
    const hasForbidden = !!this.possibleWaysFromCursor$.value.find(t => t.color === WAY_MAPTRACK_FORBIDDEN_COLOR) ||
                         !!this.possibleWaysFromLastAnchor$.value.find(t => t.color === WAY_MAPTRACK_FORBIDDEN_COLOR);
    let html = '';
    if (hasPermissive)
      html += '<div style="display: flex; flex-direction: row; align-items: center; padding: 4px"><div style="height: 0; width: 25px; margin-right: 10px; border-bottom: 3px solid ' + WAY_MAPTRACK_PERMISSIVE_COLOR + '"></div><div>' + this.i18n.texts.pages.trailplanner.legend.permissive + '</div></div>';
    if (hasForbidden)
      html += '<div style="display: flex; flex-direction: row; align-items: center; padding: 4px"><div style="height: 0; width: 25px; margin-right: 10px; border-bottom: 3px solid ' + WAY_MAPTRACK_FORBIDDEN_COLOR + '"></div><div>' + this.i18n.texts.pages.trailplanner.legend.forbidden + '</div></div>';
    legend.innerHTML = html;
  }

  private anchorMapOverSubscription?: Subscription;
  private anchorMapClickSubscription?: Subscription;
  private _addAnchor?: MapAnchor;

  private enablePutAnchor(): void {
    this.disableFreeAnchor();
    this.putAnchors = true;
    this._addAnchor = this.createAnchor({lat: 0, lng: 0}, '+');
    this.anchorMapOverSubscription = this.map!.mouseOverPoint.subscribe(refs => {
      if (this.mapState!.zoom < MIN_ZOOM) {
        this.possibleWaysFromCursor$.next([]);
        this.possibleWaysFromLastAnchor$.next([]);
        this.map!.removeFromMap(this._addAnchor!.marker);
        return;
      }
      this.setHighlightedWays([]);
      const ref = this.getEligiblePoint(refs);
      if (!ref?.ref) {
        this.map!.removeFromMap(this._addAnchor!.marker);
        this.possibleWaysFromCursor$.next([]);
      } else {
        const pos = ref.ref.position;
        this._addAnchor!.marker.setLatLng(pos);
        this.map!.addToMap(this._addAnchor!.marker);

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
    });
    this.anchorMapClickSubscription = this.map!.mouseClickPoint.subscribe(refs => {
      if (this.mapState!.zoom < MIN_ZOOM) {
        return;
      }
      const ref = this.getEligiblePoint(refs);
      if (!ref?.ref) return;
      this.newPoint(ref.ref.position, ref.using);
    });
  }

  private disablePutAnchors(): void {
    this.anchorMapOverSubscription?.unsubscribe();
    this.anchorMapOverSubscription = undefined;
    this.anchorMapClickSubscription?.unsubscribe();
    this.anchorMapClickSubscription = undefined;
    this.putAnchors = false;
    if (this._addAnchor) {
      this.map!.removeFromMap(this._addAnchor.marker);
      this._addAnchor = undefined;
    }
    this.highlightedWays = [];
  }

  enableFreeAnchor(): void {
    this.disablePutAnchors();
    this.cancelWays();
    this.putFreeAnchor = true;
    this._addAnchor = this.createAnchor({lat: 0, lng: 0}, '+');
    this.map!.addToMap(this._addAnchor!.marker);
    this.anchorMapOverSubscription = this.map!.mouseOver.subscribe(pos => {
      this._addAnchor!.marker.setLatLng(pos);
    });
    this.anchorMapClickSubscription = this.map!.mouseClick.subscribe(pos => {
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
      this.map!.removeFromMap(this._addAnchor.marker);
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
    const linkToPrevious = refs.filter(r => previousPosMapTracks.indexOf(r.track) >= 0).sort((r1, r2) => r1.distanceToEvent - r2.distanceToEvent);
    let best: {ref: MapTrackPointReference, using: MapTrack | undefined} | undefined = undefined;
    let bestWays: Way[] = [];
    for (const ref of linkToPrevious) {
      const matching = this.getMatchingMapTracksIn(ref.position, previousPosMapTracks);
      if (matching.length === 1) {
        const ways = this.getMatchingWays(ref.position);
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
      } else {
        if (mt.track.points.find(pt => p.distanceTo(pt) <= MATCHING_MAX_DISTANCE)) {
          matching.push(mt);
        }
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

  private createAnchor(pos: L.LatLngLiteral, text: string): MapAnchor {
    return new MapAnchor(pos, '#d00000', text, undefined, '#ffffff', '#d00000');
  }

  private newPoint(pos: L.LatLngLiteral, using: MapTrack | undefined): void {
    const anchor = this.createAnchor(pos, '' + (this.anchors.length + 1));
    if (this.anchors.length === 0) {
      // first point
      const segment = this.track!.newSegment();
      segment.append(new Point(pos.lat, pos.lng));
    } else if (using) {
      const previousPos = this.anchors[this.anchors.length - 1].point;
      const points = (using.track as SimplifiedTrackSnapshot).points;
      this.goTo(previousPos, pos, points);
    } else {
      // free point
      const point = new Point(pos.lat, pos.lng);
      this.anchorsPoints.push([point]);
      this.track!.lastSegment.append(point);
    }
    this.anchors.push(anchor);
    this.map!.addToMap(anchor.marker);
    const matching = this.getMatchingWays(pos);
    this.updateMapTracks(matching);
    this.updateCurrentMapTrack();
    this.saveToLocalStorage();
  }

  private updateElevationGraph(): void {
    const graph = this._children$.value.find(c => c instanceof ElevationGraphComponent) as ElevationGraphComponent;
    if (graph) {
      graph.updateTrack(this.track!);
    }
  }

  private goTo(from: L.LatLngLiteral, to: L.LatLngLiteral, points: SimplifiedPoint[]): void {
    const fromIndex = TrackUtils.findClosestPoint(from, points, MATCHING_MAX_DISTANCE);
    if (fromIndex < 0) return;
    const toIndex = TrackUtils.findClosestPoint(to, points, MATCHING_MAX_DISTANCE);
    if (toIndex < 0) return;
    const increment = fromIndex < toIndex ? 1 : -1;
    const result: Point[] = [];
    for (let i = fromIndex + increment; i != toIndex + increment; i = i + increment) {
      result.push(new Point(points[i].lat, points[i].lng));
    }
    this.anchorsPoints.push(result);
    this.track!.lastSegment.appendMany(result);
  }

  undo(): void {
    if (this.anchors.length === 1) {
      this.map!.removeFromMap(this.anchors[0].marker);
      this.anchors = [];
      this.start();
    } else {
      this.track!.lastSegment.removeMany(this.anchorsPoints[this.anchorsPoints.length - 1]);
      this.anchorsPoints.splice(this.anchorsPoints.length - 1, 1);
      const anchor = this.anchors.splice(this.anchors.length - 1, 1)[0];
      this.map!.removeFromMap(anchor.marker);
      this.updateCurrentMapTrack();
      const matching = this.getMatchingWays(this.anchors[this.anchors.length - 1].point);
      this.updateMapTracks(matching);
    }
  }

  private updateCurrentMapTrack(): void {
    const mt = new MapTrack(
      undefined,
      this.track!,
      '#FF000080',
      1, false, this.i18n
    );
    mt.showArrowPath();
    this.currentMapTrack$.next(mt);
    this.getElevation().subscribe(() => {
      this.saveToLocalStorage();
      this.estimatedTime = estimateTimeForTrack(this.track!, this.injector.get(PreferencesService).preferences);
      this.updateElevationGraph();
    });
  }

  private loadFromLocalStorage(): void {
    const trackInStorage = localStorage.getItem(LOCALSTORAGE_KEY_PREFIX + this.injector.get(AuthService).email + '.track');
    if (trackInStorage) {
      const pointsInStorage = localStorage.getItem(LOCALSTORAGE_KEY_PREFIX + this.injector.get(AuthService).email + '.points');
      if (pointsInStorage) {
        try {
          const points = JSON.parse(pointsInStorage) as {s: number, p: number}[];
          const dto = JSON.parse(trackInStorage) as Partial<TrackDto>;
          this.track = new Track(dto, this.injector.get(PreferencesService));
          for (let i = 0; i < points.length; ++i) {
            const p = points[i];
            const point = this.track.segments[p.s].points[p.p];
            const a = this.createAnchor(point.pos, '' + (this.anchors.length + 1));
            this.anchors.push(a);
            this.map!.addToMap(a.marker);
            if (i > 0) {
              const prev = points[i - 1];
              if (p.s != prev.s) this.anchorsPoints.push([]);
              else this.anchorsPoints.push(this.track.segments[p.s].points.slice(prev.p + 1, p.p + 1));
            }
          }
          this.updateCurrentMapTrack();
        } catch (e) {
          console.log(e);
          console.log(trackInStorage, pointsInStorage);
          // ignore
        }
      }
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
    for (let i = 0; i < this.anchorsPoints.length; ++i) {
      const ap = this.anchorsPoints[i];
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

  private updateWays(): void {
    if (!this.putAnchors) return;
    if (this.mapState!.zoom < MIN_ZOOM) {
      this.cancelWays();
      return;
    }
    this.geo.findWays(this.map!.getBounds()!).subscribe(ways => this.updateWaysFromService(ways));
  }

  private cancelWays(): void {
    this.ways = [];
    this.possibleWaysFromCursor$.next([]);
    this.possibleWaysFromLastAnchor$.next([]);
    this.highlightedWays = [];
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

  private updateRoutes(): void {
    this.routes = [];
    this.routesMapTracks$.next([]);
    this.highlightedRoutes = [];
    if (!this.showRoutes || !this.mapState || this.mapState.zoom < MIN_ZOOM) return;
    this.geo.findRoutes(this.map!.getBounds()!).subscribe(routes => {
      this.routes = routes;
      const tracks: MapTrack[] = [];
      for (const route of this.routes) {
        tracks.push(...this.routeToMapTracks(route));
      }
      this.routesMapTracks$.next(tracks);
    });
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
      this.getWayColor(way), 1, false, this.i18n
    );
    mapTrack.data = {element: way, type: 'way'};
    return mapTrack;
  }

  private routeToMapTrack(route: RouteCircuit, points: L.LatLng[]): MapTrack {
    const mapTrack = new MapTrack(
      undefined,
      {
        points: points
      },
      ROUTE_MAPTRACK_DEFAULT_COLOR, 1, false, this.i18n
    );
    mapTrack.data = {element: route, type: 'route'};
    return mapTrack;
  }

  private routeToMapTracks(route: RouteCircuit): MapTrack[] {
    const result: MapTrack[] = [];
    const remaining = [...route.segments];
    const firstPoints = remaining.map(s => s[0]);
    while (remaining.length > 0) {
      const points: L.LatLng[] = [];
      points.push(...remaining.splice(0, 1)[0]);
      firstPoints.splice(0, 1);
      let prev = points[points.length - 1];
      while (remaining.length > 0) {
        const index = TrackUtils.findClosestPoint(prev, firstPoints, MATCHING_MAX_DISTANCE);
        if (index < 0) break;
        const segment = remaining.splice(index, 1)[0];
        firstPoints.splice(index, 1);
        points.push(...segment);
        prev = points[points.length - 1];
      }
      result.push(this.routeToMapTrack(route, points));
    }
    return result;
  }

  private getElevation(): Observable<any> {
    return this.geo.fillTrackElevation(this.track!);
  }


  generateRouteSymbol(route: RouteCircuit): SafeHtml | string {
    if ((route as any)._symbol) return (route as any)._symbol;
    if (!route.oscmSymbol) return '';
    const svg = this.injector.get(OsmcSymbolService).generateSymbol(route.oscmSymbol);
    (route as any)._symbol = this.injector.get(DomSanitizer).bypassSecurityTrustHtml(svg);
    return (route as any)._symbol;
  }

}

