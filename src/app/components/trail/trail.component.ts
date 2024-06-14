import { Component, Injector, Input, ViewChild } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map, mergeMap, of } from 'rxjs';
import { Trail } from 'src/app/model/trail';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { MapComponent } from '../map/map.component';
import { MapTrack } from '../map/track/map-track';
import { Track } from 'src/app/model/track';
import { TrackService } from 'src/app/services/database/track.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { Platform } from '@ionic/angular';
import { IonSegment, IonSegmentButton, IonIcon, IonButton } from "@ionic/angular/standalone";
import { TrackMetadataComponent } from '../track-metadata/track-metadata.component';
import { ElevationGraphComponent } from '../elevation-graph/elevation-graph.component';
import { MapTrackPointReference } from '../map/track/map-track-point-reference';
import { Point } from 'src/app/model/point';
import { ElevationGraphPointReference } from '../elevation-graph/elevation-graph-point-reference';
import { IconLabelButtonComponent } from '../icon-label-button/icon-label-button.component';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';

@Component({
  selector: 'app-trail',
  templateUrl: './trail.component.html',
  styleUrls: ['./trail.component.scss'],
  standalone: true,
  imports: [IonButton, IonIcon, IonSegmentButton, IonSegment,
    CommonModule,
    MapComponent,
    TrackMetadataComponent,
    ElevationGraphComponent,
    IconLabelButtonComponent,
  ]
})
export class TrailComponent extends AbstractComponent {

  @Input() trail1$!: Observable<Trail | null>;
  @Input() trail2$?: Observable<Trail | null>;

  trail1: Trail | null = null;
  trail2: Trail | null = null;
  tracks$ = new BehaviorSubject<Track[]>([]);
  mapTracks$ = new BehaviorSubject<MapTrack[]>([]);

  @ViewChild(MapComponent) map?: MapComponent;
  @ViewChild(ElevationGraphComponent) elevationGraph?: ElevationGraphComponent;

  displayMode = 'large';
  tab = 'map';
  bottomSheetOpen = false;
  bottomSheetTab = 'info';

  constructor(
    injector: Injector,
    private trackService: TrackService,
    public i18n: I18nService,
    private platform: Platform,
    private offlineMap: OfflineMapService,
  ) {
    super(injector);
  }

  protected override initComponent(): void {
    this.updateDisplay();
    this.whenVisible.subscribe(this.platform.resize, () => this.updateDisplay());
    this.visible$.subscribe(() => this.updateDisplay());
    setTimeout(() => this.updateDisplay(), 0);
  }

  protected override getComponentState() {
    return {
      trail1: this.trail1$,
      trail2: this.trail2$
    }
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.trail1 = null;
    this.trail2 = null;
    this.tracks$.next([]);
    this.mapTracks$.next([]);
    this.byStateAndVisible.subscribe(
      combineLatest([this.trail$(this.trail1$), this.trail$(this.trail2$)]),
      ([trail1, trail2]) => {
        this.trail1 = trail1[0];
        this.trail2 = trail2[0];
        const tracks: Track[] = [];
        if (trail1[1]) {
          tracks.push(trail1[1]);
          if (trail2[1]) tracks.push(trail2[1]);
        }
        const mapTracks: MapTrack[] = [];
        if (trail1[2]) {
          mapTracks.push(trail1[2]);
          if (trail2[2]) mapTracks.push(trail2[2]);
        }
        this.tracks$.next(tracks);
        this.mapTracks$.next(mapTracks);
      }
    );
  }

  private trail$(trail$?: Observable<Trail | null>): Observable<[Trail | null, Track | undefined, MapTrack | undefined]> {
    if (!trail$) return of(([null, undefined, undefined]) as [Trail | null, Track | undefined, MapTrack | undefined]);
    return trail$.pipe(
      mergeMap(trail => {
        if (!trail) return of(([null, undefined, undefined]) as [Trail | null, Track | undefined, MapTrack | undefined]);
        return trail.currentTrackUuid$.pipe(
          mergeMap(uuid => this.trackService.getFullTrack$(uuid, trail.owner)),
          map(track => {
            if (!track) return ([trail, undefined, undefined]) as [Trail | null, Track | undefined, MapTrack | undefined];
            const mapTrack = new MapTrack(trail, track, 'red', 1, false, this.i18n);
            mapTrack.showDepartureAndArrivalAnchors();
            mapTrack.showWayPointsAnchors();
            return ([trail, track, mapTrack]) as [Trail | null, Track | undefined, MapTrack | undefined];
          })
        )
      })
    );
  }

  private updateDisplay(): void {
    const w = this.platform.width();
    const h = this.platform.height();
    if (w >= 750 + 350) {
      this.displayMode = 'large';
      this.updateVisibility(true, true);
    } else {
      this.displayMode = 'small';
      this.updateVisibility(this.tab === 'map', this.bottomSheetTab === 'elevation');
    }
  }

  private updateVisibility(mapVisible: boolean, graphVisible: boolean): void {
    this._children.forEach(child => {
      if (child instanceof MapComponent) child.setVisible(mapVisible);
      else if (child instanceof ElevationGraphComponent) child.setVisible(graphVisible);
      else if (child instanceof TrackMetadataComponent) {

      }
      else console.error('unexpected child', child);
    })
  }

  protected override _propagateVisible(visible: boolean): void {
    // no
  }

  setTab(tab: string): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.updateDisplay();
  }

  toggleBottomSheet(): void {
    this.bottomSheetOpen = !this.bottomSheetOpen;
    this.updateDisplay();
  }

  setBottomSheetTab(tab: string): void {
    if (tab === this.bottomSheetTab) return;
    this.bottomSheetTab = tab;
    this.updateDisplay();
  }

  private _hoverCursor: {pos: L.LatLngExpression}[] = [];

  private resetHover(): void {
    this._hoverCursor.forEach(cursor => {
      this.map?.cursors.removeCursor(cursor.pos);
    });
    this._hoverCursor = [];
  }

  mouseOverPointOnMap(event?: MapTrackPointReference) {
    this.resetHover();
    this.elevationGraph?.hideCursor();
    if (event) {
      const pt = event.point;
      const pos = pt instanceof Point ? pt.pos : pt;
      this.map?.cursors.addCursor(pos);
      this.elevationGraph?.showCursorForPosition(pos.lat, pos.lng);
      this._hoverCursor.push({pos});
    }
  }

  elevationGraphPointHover(references: ElevationGraphPointReference[]) {
    this.resetHover();
    references.forEach(pt => {
      const pos = pt.pos;
      this._hoverCursor.push({pos});
      this.map?.cursors.addCursor(pos);
    });
  }

  mouseClickOnMap(event?: MapTrackPointReference) {

  }


  goToDeparture(): void {
    if (this.tracks$.value.length === 0) return;
    const point = this.tracks$.value[0].departurePoint;
    if (!point) return;
    if (this.platform.is('capacitor')) {
      const link = document.createElement('A') as HTMLAnchorElement;
      link.style.position = 'fixed';
      link.style.top = '-10000px';
      link.style.left = '-10000px';
      link.href = 'geo:0,0?q=' + point.pos.lat + ',' + point.pos.lng;
      link.target = '_blank';
      document.documentElement.appendChild(link);
      link.click();
      document.documentElement.removeChild(link);
    } else {
      const link = document.createElement('A') as HTMLAnchorElement;
      link.style.position = 'fixed';
      link.style.top = '-10000px';
      link.style.left = '-10000px';
      link.target = '_blank';
      link.href = 'https://www.google.com/maps/dir/?api=1&dir_action=navigate&destination=' + point.pos.lat + ',' + point.pos.lng;
      document.documentElement.appendChild(link);
      link.click();
      document.documentElement.removeChild(link);
    }
  }

  downloadMap(): void {
    if (!this.map) return;
    const layer = this.map.tilesLayers.find(l => l.layer.name === 'osm');
    if (!layer) return;
    let bounds: L.LatLngBounds | undefined = undefined;
    this.mapTracks$.value.forEach(track => {
      const b = track.bounds
      if (b)
        if (!bounds) bounds = b; else bounds = bounds.extend(b);
    });
    if (!bounds) return;
    bounds = (bounds as L.LatLngBounds).pad(1);
    this.offlineMap.save(bounds, layer.tiles, this.map.crs, layer.layer);
  }
}
