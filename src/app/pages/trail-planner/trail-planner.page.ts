import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Injector, ViewChild } from '@angular/core';
import { combineLatest, debounceTime, first, map, Observable, of } from 'rxjs';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { MapState } from 'src/app/components/map/map-state';
import { MapComponent } from 'src/app/components/map/map.component';
import { MapTrack } from 'src/app/components/map/track/map-track';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { AbstractPage } from 'src/app/utils/component-utils';
import { IonButton, IonIcon, IonToggle, IonLabel, IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonFooter, IonButtons,
  IonInput, IonSelect, IonSelectOption, ModalController, IonSpinner } from "@ionic/angular/standalone";
import { Track } from 'src/app/model/track';
import { MapTrackPointReference } from 'src/app/components/map/track/map-track-point-reference';
import { SearchPlaceComponent } from 'src/app/components/search-place/search-place.component';
import { Place } from 'src/app/services/geolocation/place';
import { FormsModule } from '@angular/forms';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { TrailCollection } from 'src/app/model/trail-collection';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { Router } from '@angular/router';
import { ElevationGraphComponent } from 'src/app/components/elevation-graph/elevation-graph.component';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { TrailOverviewCondensedComponent } from 'src/app/components/trail-overview/condensed/trail-overview-condensed.component';
import { TrackBuilder, WAY_MAPTRACK_FORBIDDEN_COLOR, WAY_MAPTRACK_PERMISSIVE_COLOR } from './track-builder';
import { Trails } from './trails';
import { TrailHoverCursor } from 'src/app/components/trail/hover-cursor';
import { ElevationGraphPointReference } from 'src/app/components/elevation-graph/elevation-graph-events';
import { TrailCollectionType } from 'src/app/model/dto/trail-collection';

@Component({
    selector: 'app-trail-planner',
    templateUrl: './trail-planner.page.html',
    styleUrls: ['./trail-planner.page.scss'],
    imports: [
      IonSpinner, IonSelect, IonSelectOption, IonInput, IonButtons, IonFooter, IonContent, IonTitle, IonToolbar, IonHeader,
      IonModal, IonLabel, IonToggle, IonIcon, IonButton,
      HeaderComponent, MapComponent, CommonModule, SearchPlaceComponent, FormsModule, ElevationGraphComponent,
      TrailOverviewCondensedComponent,
    ]
})
export class TrailPlannerPage extends AbstractPage {

  trackBuilder?: TrackBuilder;
  trails?: Trails;

  mapTracks$: Observable<MapTrack[]> = of([]);

  mapState?: MapState;
  minZoom = 14;

  map?: MapComponent;
  @ViewChild(ElevationGraphComponent) elevationGraph?: ElevationGraphComponent;

  trailName = '';
  collectionUuid?: string;
  collections: TrailCollection[] = [];

  bottomTab: 'info' | 'elevation' = 'info';
  leftPaneOpen = false;

  hover: TrailHoverCursor;

  constructor(
    injector: Injector,
    public i18n: I18nService,
    collectionService: TrailCollectionService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    super(injector);
    this.hover = new TrailHoverCursor(() => this.map, () => this.elevationGraph);
    this.whenAlive.add(collectionService.getAll$().pipe(
      collection$items(),
    ).subscribe(
      collections => this.collections = collections
    ));
  }

  protected override initComponent(): void {
    this._children$.pipe(
      map(children => children.find(child => child instanceof MapComponent)),
      filterDefined(),
      first()
    ).subscribe(mapComponent => {
      this.map = mapComponent;
      this.mapState = this.map.getState();
      this.trackBuilder = new TrackBuilder(this.injector, this);
      this.trails = new Trails(this.injector, this);
      this.mapTracks$ = combineLatest([this.trackBuilder.currentMapTrack$, this.trackBuilder.possibleWaysFromLastAnchor$, this.trackBuilder.possibleWaysFromCursor$, this.trails.trailsMapTracks$]).pipe(
        debounceTime(10),
        map(([currentTrack, list1, list2, list3]) => {
          const all = [...list1, ...list2, ...list3];
          if (currentTrack) all.push(currentTrack);
          this.updateLegend();
          return all;
        })
      );
      this.whenVisible.subscribe(
        combineLatest([this.mapState.center$, this.mapState.zoom$]).pipe(debounceTime(200)),
        () => {
          this.trackBuilder!.mapChanged();
          this.trails!.mapChanged();
        }
      );
    });
  }

  reset(): void {
    this.trackBuilder!.reset();
    this.trailName = '';
    this.collectionUuid = undefined;
  }

  openSaveModal(modal: IonModal): void {
    if (!this.trackBuilder || this.trackBuilder.anchors.length < 2) return;
    modal.present();
  }

  save(): void {
    const trail = this.trackBuilder!.save(this.collectionUuid!, this.trailName);
    this.reset();
    this.injector.get(Router).navigateByUrl('/trail/' + encodeURIComponent(trail.owner) + '/' + encodeURIComponent(trail.uuid));
    this.injector.get(ModalController).dismiss(null, 'ok');
  }

  getCollectionName(collection: TrailCollection): string {
    if (collection.name.length === 0 && collection.type === TrailCollectionType.MY_TRAILS)
      return this.i18n.texts.my_trails;
    return collection.name;
  }

  goToPlace(place: Place): void {
    this.map?.goTo(place.lat, place.lng, 14);
  }

  updateElevationGraph(track: Track): void {
    const graph = this._children$.value.find(c => c instanceof ElevationGraphComponent) as ElevationGraphComponent;
    if (graph) {
      graph.updateTrack(track);
    }
  }

  private updateLegend(): void {
    const legend = document.getElementById('trail-planner-legend');
    if (!legend) return;
    const hasPermissive = !!this.trackBuilder?.possibleWaysFromCursor$.value.find(t => t.color === WAY_MAPTRACK_PERMISSIVE_COLOR) ||
                          !!this.trackBuilder?.possibleWaysFromLastAnchor$.value.find(t => t.color === WAY_MAPTRACK_PERMISSIVE_COLOR);
    const hasForbidden = !!this.trackBuilder?.possibleWaysFromCursor$.value.find(t => t.color === WAY_MAPTRACK_FORBIDDEN_COLOR) ||
                          !!this.trackBuilder?.possibleWaysFromLastAnchor$.value.find(t => t.color === WAY_MAPTRACK_FORBIDDEN_COLOR);
    let html = '';
    if (hasPermissive)
      html += '<div style="display: flex; flex-direction: row; align-items: center; padding: 4px"><div style="height: 0; width: 25px; margin-right: 10px; border-bottom: 3px solid ' + WAY_MAPTRACK_PERMISSIVE_COLOR + '"></div><div>' + this.i18n.texts.pages.trailplanner.legend.permissive + '</div></div>';
    if (hasForbidden)
      html += '<div style="display: flex; flex-direction: row; align-items: center; padding: 4px"><div style="height: 0; width: 25px; margin-right: 10px; border-bottom: 3px solid ' + WAY_MAPTRACK_FORBIDDEN_COLOR + '"></div><div>' + this.i18n.texts.pages.trailplanner.legend.forbidden + '</div></div>';
    legend.innerHTML = html;
    this.changeDetector.detectChanges();
  }

  mapClickPoint(event: MapTrackPointReference[]): void {
    const closest = MapTrackPointReference.closest(event);
    if (closest?.track.trail && this.trails?.list?.find(t => t.trail === closest.track.trail)) {
      this.trails.toggleHighlightTrail(closest.track.trail);
    } else if (this.trails?.highlightedTrail) {
      this.trails.toggleHighlightTrail(this.trails.highlightedTrail);
    }
  }

  mouseOverPointOnMap(event: MapTrackPointReference[]) {
    const closest = MapTrackPointReference.closest(event);
    if (closest?.track && closest.track === this.trackBuilder?.currentMapTrack$.value)
      this.hover.mouseOverPointOnMap(closest);
  }

  elevationGraphPointHover(references: ElevationGraphPointReference[]) {
    this.hover.elevationGraphPointHover(references);
  }

}

