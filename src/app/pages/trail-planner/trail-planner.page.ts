import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Injector } from '@angular/core';
import { BehaviorSubject, catchError, combineLatest, debounceTime, filter, first, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { MapState } from 'src/app/components/map/map-state';
import { MapComponent } from 'src/app/components/map/map.component';
import { MapAnchor } from 'src/app/components/map/markers/map-anchor';
import { MapTrack } from 'src/app/components/map/track/map-track';
import { Point, PointDescriptor } from 'src/app/model/point';
import { SimplifiedPoint, SimplifiedTrackSnapshot } from 'src/app/services/database/track-database';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { AbstractPage } from 'src/app/utils/component-utils';
import { IonButton, IonIcon, IonList, IonItem, IonToggle, IonLabel, IonCheckbox, IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonFooter, IonButtons, IonInput, IonSelect, IonSelectOption, ModalController, IonSpinner } from "@ionic/angular/standalone";
import { Track } from 'src/app/model/track';
import { AuthService } from 'src/app/services/auth/auth.service';
import { MapTrackPointReference } from 'src/app/components/map/track/map-track-point-reference';
import { Arrays } from 'src/app/utils/arrays';
import { TrackDto } from 'src/app/model/dto/track';
import { TrackUtils } from 'src/app/utils/track-utils';
import L from 'leaflet';
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
import { TrackEditionService } from 'src/app/services/track-edition/track-edition.service';
import { Console } from 'src/app/utils/console';
import { ErrorService } from 'src/app/services/progress/error.service';
import { ShareService } from 'src/app/services/database/share.service';
import { Share } from 'src/app/model/share';

const MIN_ZOOM = 14;

const WAY_MAPTRACK_DEFAULT_COLOR = '#0000FF80'
const WAY_MAPTRACK_HIGHLIGHTED_COLOR = '#000080FF'
const WAY_MAPTRACK_FORBIDDEN_COLOR = '#B03030FF';
const WAY_MAPTRACK_PERMISSIVE_COLOR = '#C08000FF';
const ROUTE_MAPTRACK_DEFAULT_COLOR = '#FF00FF80';
const ROUTE_MAPTRACK_HIGHLIGHTED_COLOR = '#A08000FF';
const TRAIL_MAPTRACK_DEFAULT_COLOR = '#0000FF80';
const TRAIL_MAPTRACK_HIGHLIGHTED_COLOR = '#FF00FFFF';

const LOCALSTORAGE_KEY_PREFIX = 'trailence.trail-planner.';

const MATCHING_MAX_DISTANCE = 2.5;

@Component({
    selector: 'app-trail-planner',
    templateUrl: './trail-planner.page.html',
    styleUrls: ['./trail-planner.page.scss'],
    imports: [IonSpinner, IonSelect, IonSelectOption, IonInput, IonButtons, IonFooter, IonContent, IonTitle, IonToolbar, IonHeader, IonModal, IonCheckbox, IonLabel, IonToggle, IonItem, IonList,
        IonIcon, IonButton, HeaderComponent, MapComponent, CommonModule, SearchPlaceComponent, FormsModule, ElevationGraphComponent]
})
export class TrailPlannerPage extends AbstractPage {

  ways: Way[] = [];
  routes: RouteCircuit[] = [];
  trails: {trail: Trail; track: Track; collectionName: string}[] = [];

  currentMapTrack$ = new BehaviorSubject<MapTrack | undefined>(undefined);
  possibleWaysFromCursor$ = new BehaviorSubject<MapTrack[]>([]);
  possibleWaysFromLastAnchor$ = new BehaviorSubject<MapTrack[]>([]);

  routesMapTracks$ = new BehaviorSubject<MapTrack[]>([]);
  trailsMapTracks$ = new BehaviorSubject<MapTrack[]>([]);

  mapTracks$: Observable<MapTrack[]>;

  mapState?: MapState;
  minZoom = MIN_ZOOM;

  private map?: MapComponent;

  anchors: MapAnchor[] = [];
  anchorsPoints: Point[][] = [];
  track?: Track;
  putAnchors = false;
  showRoutes = false;
  showMyTrails = false;
  estimatedTime = 0;
  putFreeAnchor = false;

  trailName = '';
  collectionUuid?: string;
  collections: TrailCollection[] = [];

  private highlightedWays: MapTrack[] = [];
  private highlightedRoutes: MapTrack[] = [];
  private highlightedTrails: MapTrack[] = [];
  highlightedRoute?: RouteCircuit;
  highlightedTrail?: Trail;

  constructor(
    injector: Injector,
    public i18n: I18nService,
    collectionService: TrailCollectionService,
    private readonly geo: GeoService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    super(injector);
    this.mapTracks$ = combineLatest([this.currentMapTrack$, this.possibleWaysFromLastAnchor$, this.possibleWaysFromCursor$, this.routesMapTracks$, this.trailsMapTracks$]).pipe(
      debounceTime(10),
      map(([currentTrack, list1, list2, list3, list4]) => {
        const all = [...list1, ...list2, ...list3, ...list4];
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
      this.map = map;
      this.mapState = this.map.getState();
      this.whenVisible.subscribe(
        combineLatest([this.mapState.center$, this.mapState.zoom$]).pipe(debounceTime(200)),
        () => {
          this.updateWays();
          this.updateRoutes();
          this.updateTrails();
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
    this.injector.get(TrackEditionService).computeFinalMetadata(trail, this.track!);
    this.injector.get(TrackService).create(this.track!);
    this.injector.get(TrailService).create(trail);
    this.reset();
    this.injector.get(Router).navigateByUrl('/trail/' + encodeURIComponent(trail.owner) + '/' + encodeURIComponent(trail.uuid));
    this.injector.get(ModalController).dismiss(null, 'ok');
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

  private setHighlightedRoutes(tracks: MapTrack[]): void {
    this.highlightedRoutes.forEach(t => t.color = ROUTE_MAPTRACK_DEFAULT_COLOR);
    this.highlightedRoutes = tracks;
    this.highlightedRoutes.forEach(t => {
      t.color = ROUTE_MAPTRACK_HIGHLIGHTED_COLOR;
      t.bringToFront();
    });
    this.changeDetector.detectChanges();
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

  toggleShowMyTrails(enabled: boolean): void {
    this.showMyTrails = enabled;
    this.updateTrails();
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
    this.changeDetector.detectChanges();
  }

  private anchorMapOverSubscription?: Subscription;
  private anchorMapClickSubscription?: Subscription;
  private _addAnchor?: MapAnchor;

  private enablePutAnchor(): void {
    this.disableFreeAnchor();
    this.putAnchors = true;
    this._addAnchor = this.createAnchor({lat: 0, lng: 0}, '+', false);
    this.anchorMapOverSubscription = this.map!.mouseOverPoint.subscribe(refs => {
      if (this.mapState!.zoom < MIN_ZOOM) {
        this.possibleWaysFromCursor$.next([]);
        this.possibleWaysFromLastAnchor$.next([]);
        this.map!.removeFromMap(this._addAnchor!.marker);
        this.changeDetector.detectChanges();
        return;
      }
      this.setHighlightedWays([]);
      const ref = this.getEligiblePoint(refs);
      if (!ref?.ref?.point) {
        this.map!.removeFromMap(this._addAnchor!.marker);
        this.possibleWaysFromCursor$.next([]);
      } else {
        const pos = ref.ref.position!;
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
      this.changeDetector.detectChanges();
    });
    this.anchorMapClickSubscription = this.map!.mouseClickPoint.subscribe(refs => {
      if (this.mapState!.zoom < MIN_ZOOM) {
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
      this.map!.removeFromMap(this._addAnchor.marker);
      this._addAnchor = undefined;
    }
    this.highlightedWays = [];
  }

  enableFreeAnchor(): void {
    this.disablePutAnchors();
    this.cancelWays();
    this.putFreeAnchor = true;
    this._addAnchor = this.createAnchor({lat: 0, lng: 0}, '+', false);
    this.map!.addToMap(this._addAnchor.marker);
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
    this.map!.addToMap(anchor.marker);
    const matching = this.getMatchingWays(pos);
    this.updateMapTracks(matching);
    this.updateCurrentMapTrack();
    this.saveToLocalStorage();
    this.changeDetector.detectChanges();
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
    const result: PointDescriptor[] = [];
    for (let i = fromIndex + increment; i != toIndex + increment; i = i + increment) {
      result.push({pos: { lat: points[i].lat, lng: points[i].lng } });
    }
    this.anchorsPoints.push( this.track!.lastSegment.appendMany(result) );
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
    this.changeDetector.detectChanges();
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
        this.map!.addToMap(a.marker);
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

  private updateWays(): void {
    if (!this.putAnchors) return;
    if (this.mapState!.zoom < MIN_ZOOM) {
      this.cancelWays();
      return;
    }
    this.geo.findWays(this.map!.getBounds()!).subscribe(ways => this.updateWaysFromService(ways)); // NOSONAR
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

  searchingRoutes = false;
  private updateRoutes(): void {
    this.routes = [];
    this.routesMapTracks$.next([]);
    const previousHighlightedId = this.highlightedRoute?.id;
    this.highlightedRoute = undefined;
    this.highlightedRoutes = [];
    if (!this.showRoutes || !this.mapState || this.mapState.zoom < MIN_ZOOM) return;
    this.searchingRoutes = true;
    this.geo.findRoutes(this.map!.getBounds()!) // NOSONAR
    .pipe(catchError(e => {
      this.injector.get(ErrorService).addTechnicalError(e, 'errors.search_routes', []);
      Console.error(e);
      return of([]);
    }))
    .subscribe(routes => {
      this.searchingRoutes = false;
      this.routes = routes;
      const tracks: MapTrack[] = [];
      for (const route of this.routes) {
        const mapTracks = this.routeToMapTracks(route);
        tracks.push(...mapTracks);
        if (previousHighlightedId && previousHighlightedId === route.id) {
          this.highlightedRoute = route;
          this.highlightedRoutes = mapTracks;
        }
      }
      this.routesMapTracks$.next(tracks);
      this.setHighlightedRoutes(this.highlightedRoutes);
      this.changeDetector.detectChanges();
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

  mapClickPoint(event: MapTrackPointReference[]): void {
    if (event.length === 0 || this.putAnchors || this.putFreeAnchor || !this.showRoutes) return;
    for (const point of event) {
      if (point.track.data?.type === 'route') {
        this.highlightedRoute = point.track.data.element;
        this.setHighlightedRoutes(this.routesMapTracks$.value.filter(t => t.data?.element === point.track.data.element));
      }
    }
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

  searchingTrails = false;
  private updateTrails(): void {
    this.trails = [];
    this.trailsMapTracks$.next([]);
    const previouslyHighlighted = this.highlightedTrail;
    this.highlightedTrail = undefined;
    this.highlightedTrails = [];
    if (!this.showMyTrails || !this.mapState) return;
    this.searchingTrails = true;
    const bounds = this.map!.getBounds()!;
    this.injector.get(TrackService).getAllMetadata$().pipe(
      collection$items(meta => !!meta.bounds && bounds.overlaps(meta.bounds)),
      first(),
      switchMap(metaList =>
        this.injector.get(TrailService).getAll$().pipe(
          collection$items(trail => !!metaList.find(meta => meta.uuid === trail.currentTrackUuid && meta.owner === trail.owner)),
          first(),
          switchMap(trails =>
            combineLatest([
              trails.length === 0 ? of([]) : this.injector.get(TrailCollectionService).getAll$().pipe(collection$items(), first()),
              trails.length === 0 ? of([]) : this.injector.get(ShareService).getAll$().pipe(collection$items(), first()),
              trails.length === 0 ? of([]) : combineLatest(trails.map(trail => this.injector.get(TrackService).getFullTrackReady$(trail.currentTrackUuid, trail.owner)))
            ])
            .pipe(
              map(([collections, shares, tracks]) => this.computeTrailsWithCollectionName(collections, shares, trails, tracks))
            )
          ),
        )
      )
    ).subscribe(list => {
      this.searchingTrails = false;
      this.trails = list.sort((e1, e2) => {
        const d1 = e1.track.departurePoint;
        const d2 = e2.track.departurePoint;
        if (!d1) {
          if (d2) return 1;
          return 0;
        }
        if (!d2) return -1;
        const l1 = d1.pos.lat - d2.pos.lat;
        if (l1 > 0) return -1;
        if (l1 < 0) return 1;
        const l2 = d1.pos.lng - d2.pos.lng;
        if (l2 < 0) return -1;
        if (l2 > 0) return 1;
        return 0;
      });
      this.trailsMapTracks$.next(list.map(t => new MapTrack(t.trail, t.track, TRAIL_MAPTRACK_DEFAULT_COLOR, 1, false, this.i18n)));
      const hl = previouslyHighlighted ? list.find(e => e.trail.owner === previouslyHighlighted.owner && e.trail.uuid === previouslyHighlighted.uuid) : undefined;
      if (hl) this.toggleHighlightTrail(hl.trail);
      this.changeDetector.detectChanges();
    });
  }

  private computeTrailsWithCollectionName(collections: TrailCollection[], shares: Share[], trails: Trail[], tracks: Track[]): {trail: Trail; track: Track; collectionName: string}[] {
    const result: {trail: Trail; track: Track; collectionName: string}[] = [];
    for (const track of tracks) {
      const trail = trails.find(trail => trail.currentTrackUuid === track.uuid && trail.owner === track.owner);
      if (!trail)  continue;
      const collection = collections.find(col => col.uuid === trail.collectionUuid && col.owner === trail.owner);
      if (collection) {
        const collectionName = collection.name.length === 0 && collection.type === TrailCollectionType.MY_TRAILS ? this.i18n.texts.my_trails : collection.name;
        result.push({trail, track, collectionName});
      } else {
        const share = shares.find(share => share.from === trail.owner && share.trails.indexOf(trail.uuid) >= 0);
        if (share) {
          result.push({trail, track, collectionName: share.name});
        }
      }
    }
    return result;
  }

  toggleHighlightTrail(trail: Trail): void {
    if (this.highlightedTrail === trail) {
      this.highlightedTrail = undefined;
      this.setHighlightedTrails([]);
    } else {
      this.highlightedTrail = trail;
      this.setHighlightedTrails(this.trailsMapTracks$.value.filter(t => t.trail === trail));
    }
  }

  private setHighlightedTrails(tracks: MapTrack[]): void {
    this.highlightedTrails.forEach(t => t.color = TRAIL_MAPTRACK_DEFAULT_COLOR);
    this.highlightedTrails = tracks;
    this.highlightedTrails.forEach(t => {
      t.color = TRAIL_MAPTRACK_HIGHLIGHTED_COLOR;
      t.bringToFront();
    });
  }

}

