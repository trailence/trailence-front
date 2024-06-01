import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { IdGenerator } from 'src/app/utils/component-utils';
import { MapState } from './map-state';
import { Subscriptions } from 'src/app/utils/subscription-utils';
import { Platform } from '@ionic/angular';
import { BehaviorSubject, EMPTY, Observable, Subscription, combineLatest, debounceTime, filter, first, interval, mergeMap, of, takeWhile, timer } from 'rxjs';
import * as L from 'leaflet';
import { MapTilesLayerOffline } from './map-tiles-layer-offline';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { DistanceUnit } from 'src/app/services/preferences/preferences';
import { MapTrack } from './track/map-track';
import { MapTrackPointReference } from './track/map-track-point-reference';
import { MapFitBoundsTool } from './tools/map-fit-bounds-tool';

const LOCALSTORAGE_KEY_MAPSTATE = 'trailence.map-state.';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: []
})
export class MapComponent implements OnInit, OnDestroy, OnChanges {

  @Input() mapId!: string;
  @Input() tracks$!: Observable<MapTrack[]>;

  @Output() mouseClickPoint = new EventEmitter<MapTrackPointReference | undefined>();


  id: string;
  private _mapState = new MapState();
  private _map$ = new BehaviorSubject<L.Map | undefined>(undefined);

  private subscriptions = new Subscriptions();

  constructor(
    private platform: Platform,
    private prefService: PreferencesService,
  ) {
    this.id = IdGenerator.generateId('map-');
  }

  ngOnInit(): void {
    this.subscriptions.add(this.platform.resize.pipe(debounceTime(500)).subscribe(() => this._map$.value?.invalidateSize()));
    this.loadState();
    this.updateTracks();
    this._mapState.live = true;
    this._mapState.live$.pipe(
      filter(live => live),
      mergeMap(() => timer(25)),
      mergeMap(() => {
        if (!this._mapState.live) return EMPTY;
        if (this.readyForMap()) return of(true);
        return interval(250).pipe(
          takeWhile(() => this._mapState.live),
          filter(() => this.readyForMap())
        );
      }),
      first()
    ).subscribe(() => this.createMap());
    this.subscriptions.add(
      combineLatest([this._mapState.center$, this._mapState.zoom$, this._mapState.tilesName$]).pipe(
        debounceTime(1000)
      ).subscribe(() => this._mapState.save(LOCALSTORAGE_KEY_MAPSTATE + this.mapId))
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mapId']) this.loadState();
    if (changes['tracks$']) this.updateTracks();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsusbcribe();
    this._map$.value?.remove();
  }

  public pause() {
    this._mapState.live = false;
  }

  public resume() {
    this._mapState.live = true;
  }

  private loadState(): void {
    this._mapState.load(LOCALSTORAGE_KEY_MAPSTATE + this.mapId);
  }

  private mapChanged(map: L.Map): void {
    this._mapState.center = map.getCenter();
    this._mapState.zoom = map.getZoom();
  }

  private _currentTracks: MapTrack[] = [];
  private _tracksSubscription?: Subscription;
  private updateTracks(): void {
    this._tracksSubscription?.unsubscribe();
    this._tracksSubscription =
      combineLatest([this.tracks$, this._mapState.live$, this._map$]).subscribe(
      ([tracks, live, map]) => {
        if (!map || !live) return;
        const toRemove = [...this._currentTracks];
        tracks.forEach(track => {
          const index = toRemove.indexOf(track);
          if (index >= 0) {
            toRemove.splice(index, 1);
          } else {
            track.addTo(map);
          }
        });
        toRemove.forEach(track => track.remove());
        this._currentTracks = tracks;
        // if the state of the map is the initial one, zoom on the tracks
        if (tracks.length > 0 && this._mapState.center.lat === 0 && this._mapState.center.lng === 0 && this._mapState.zoom <= 2) {
          this.fitTracksBounds(map, tracks);
        }
      }
    );
  }

  private fitTracksBounds(map: L.Map, tracks: MapTrack[], padding: number = 0.05): void {
    let bounds;
    for (const t of tracks) {
      if (!bounds) {
        bounds = t.bounds;
      } else {
        const tb = t.bounds;
        if (tb) {
          bounds.extend(tb);
        }
      }
    }
    if (bounds) {
      bounds = bounds.pad(padding);
      map.fitBounds(bounds);
    }
  }


  private readyForMap(): boolean {
    const element = document.getElementById(this.id);
    return !!element && element.clientHeight > 0 && element.clientWidth > 0;
  }

  private _tilesLayers?: {[key: string]: MapTilesLayerOffline};
  private createMap(): void {
    this._tilesLayers = {
      'osm': new MapTilesLayerOffline(
        'osm',
        'Open Street Map',
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        },
        this._mapState)
    }
    const map = L.map(this.id).setView(this._mapState.center, this._mapState.zoom);

    const tilesLayer = this._tilesLayers[this._mapState.tilesName] || this._tilesLayers['osm'];
    tilesLayer.addTo(map);

    const layers: L.Control.LayersObject = {};
    for (const key in this._tilesLayers) {
      layers[this._tilesLayers[key].displayName] = this._tilesLayers[key];
    }
    L.control.layers(layers, {}).addTo(map);

    map.on('resize', () => this.mapChanged(map));
    map.on('move', e => {
      this.mapChanged(map);
      if ((e as any)['originalEvent']) {
        // action from user
        // TODO this.followingLocation = false;
      }
    });
    map.on('zoom', () => this.mapChanged(map));
    map.on('click', e => {
      if (this.mouseClickPoint.observed) {
        this.mouseClickPoint.emit(this.getEvent(map, e));
      }
    });

    new MapFitBoundsTool({position: 'topleft'}).addTo(map)
    map.on('fitTrackBounds', () => this.fitTracksBounds(map, this._currentTracks));

    this._map$.next(map);

    let distanceUnit: DistanceUnit | undefined = undefined;
    let scale: L.Control.Scale | undefined = undefined;
    this.subscriptions.add(
      combineLatest([this.prefService.preferences$, this._mapState.live$]).subscribe(
        ([prefs, live]) => {
          if (!live) return;
          if (distanceUnit !== prefs.distanceUnit && this._map$.value === map) {
            if (scale) scale.remove();
            scale = L.control.scale({
              metric: prefs.distanceUnit === 'METERS',
              imperial: prefs.distanceUnit === 'MILES',
            });
            distanceUnit = prefs.distanceUnit;
            scale.addTo(map);
          }
        }
      )
    );
  }

  private getEvent(map: L.Map, e: L.LeafletMouseEvent): MapTrackPointReference | undefined {
    const mouse = e.layerPoint;
    let closest: MapTrackPointReference | undefined = undefined;
    let closestDistance: number | undefined = undefined;
    for (const mapTrack of this._currentTracks) {
      if (!mapTrack.bounds?.pad(1).contains(e.latlng)) {
        continue;
      }
      for (let segmentIndex = 0; segmentIndex < mapTrack.track.segments.length; ++segmentIndex) {
        const segment = mapTrack.track.segments[segmentIndex];
        for (let pointIndex = 0; pointIndex < segment.points.length; ++pointIndex) {
          const pt = segment.points[pointIndex];
          const pixel = map.latLngToLayerPoint(pt);
          const distance = mouse.distanceTo(pixel);
          if (distance < 15) {
            if (closestDistance === undefined || distance < closestDistance) {
              closestDistance = distance;
              closest = new MapTrackPointReference(mapTrack, segmentIndex, segment, pointIndex, pt);
            }
          }
        }
      }
    }
    return closest;
  }

}
