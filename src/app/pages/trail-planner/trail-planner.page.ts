import { Component, Injector, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { combineLatest, debounceTime, first, map, Observable, switchMap } from 'rxjs';
import { HeaderComponent } from '@trailence/components/header/header.component';
import { MapComponent, MapOptions } from '@trailence/components/map/map.component';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { AbstractPage } from '@trailence/utils/component-utils';
import { IonButton, IonIcon, IonToggle, IonLabel, IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonFooter, IonButtons,
  IonInput, IonSelect, IonSelectOption, ModalController, IonSpinner, AlertController } from "@ionic/angular";
import { Track } from '@trailence/model/track';
import { SearchPlaceComponent } from '@trailence/components/search-place/search-place.component';
import { Place } from '@trailence/services/geolocation/place';
import { FormsModule } from '@angular/forms';
import { TrailCollectionService } from '@trailence/services/database/trail-collection.service';
import { TrailCollection } from '@trailence/model/trail-collection';
import { Router } from '@angular/router';
import { TrailGraphComponent } from '@trailence/components/trail-graph/trail-graph.component';
import { filterDefined } from '@trailence/utils/rxjs/filter-defined';
import { TrailOverviewCondensedComponent } from '@trailence/components/trail-overview/condensed/trail-overview-condensed.component';
import { TrackBuilder } from './track-builder';
import { Trails } from './trails';
import { TrailHoverCursor } from '@trailence/components/trail/hover-cursor';
import { GraphPointReference } from '@trailence/components/trail-graph/graph-events';
import { TrailCollectionType } from '@trailence/model/dto/trail-collection';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { ToolbarComponent } from '@trailence/components/menus/toolbar/toolbar.component';
import { NetworkService } from '@trailence/services/network/network.service';
import { AsyncPipe, NgClass, NgStyle } from '@angular/common';
import { AuthService } from '@trailence/services/auth/auth.service';
import { BrowserService } from '@trailence/services/browser/browser.service';
import { AnyMapElement } from '@trailence/components/map/map-element';

@Component({
    selector: 'app-trail-planner',
    templateUrl: './trail-planner.page.html',
    styleUrls: ['./trail-planner.page.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
      IonSpinner, IonSelect, IonSelectOption, IonInput, IonButtons, IonFooter, IonContent, IonTitle, IonToolbar, IonHeader,
      IonModal, IonLabel, IonToggle, IonIcon, IonButton,
      HeaderComponent, MapComponent,
      SearchPlaceComponent, FormsModule, TrailGraphComponent,
      TrailOverviewCondensedComponent, ToolbarComponent,
      NgClass, NgStyle,
      AsyncPipe,
    ]
})
export class TrailPlannerPage extends AbstractPage<undefined> {

  readonly trackBuilder = new TrackBuilder(this.injector, this);
  readonly trails = new Trails(this.injector, () => this.map);

  readonly mapElements$: Observable<AnyMapElement[]> = combineLatest([
    this.trails.mapElement$,
    this.trackBuilder.trackMapElements$,
  ]).pipe(
        debounceTime(10),
        map(([trails, track]) => {
          const all = [...trails, ...this.trackBuilder.waysMapElements];
          if (track) all.push(...track);
          this.toolbar?.refresh();
          return all;
        })
      );

  readonly minZoom = 14;

  mapOptions: MapOptions = {
    geoLocationDisabled: true,
    autoFollowMyPosition: false,
    disableToggleShowPosition: true,
  };
  map?: MapComponent;
  @ViewChild(TrailGraphComponent) graph?: TrailGraphComponent;

  trailName = '';
  collectionUuid?: string;
  collections: TrailCollection[] = [];

  bottomTab: 'info' | 'elevation' = 'info';
  leftPaneOpen = false;

  hover: TrailHoverCursor;

  @ViewChild('saveModal') saveModal?: IonModal;

  @ViewChild('toolbar') toolbar?: ToolbarComponent;
  tools: MenuItem[] = [
    new MenuItem().setCustomContentSelector('app-search-place').setVisible(() => !this.trackBuilder.track && !!this.auth.auth && !this.auth.auth.isAnonymous),
    new MenuItem(),
    new MenuItem().setIcon('play').setI18nLabel('pages.trailplanner.start').setTextColor('success')
      .setVisible(() => !this.trackBuilder.track && !!this.map?.renderer && this.map.renderer.mapState.zoom >= this.minZoom)
      .setAction(() => { this.trackBuilder.start(); this.toolbar?.refresh(); }),

    new MenuItem().setIcon('location').setI18nLabel('pages.trailplanner.put_free_point')
      .setVisible(() => !!this.trackBuilder.track && !this.trackBuilder.putFreeAnchor)
      .setDisabled(() => !this.trackBuilder.putAnchors)
      .setAction(() => { this.trackBuilder.enableFreeAnchor(); this.toolbar?.refresh(); }),
    new MenuItem().setIcon('location').setI18nLabel('pages.trailplanner.back_to_non_free_point')
      .setVisible(() => !!this.trackBuilder.track && !!this.trackBuilder.putFreeAnchor)
      .setAction(() => { this.trackBuilder.backToNonFreeAnchors(); this.toolbar?.refresh(); }),
    new MenuItem().setIcon('pause').setI18nLabel('pages.trailplanner.stop').setTextColor('secondary')
      .setVisible(() => !!this.trackBuilder.track && (this.trackBuilder.putAnchors || this.trackBuilder.putFreeAnchor))
      .setAction(() => { this.trackBuilder.stop(); this.toolbar?.refresh(); }),
    new MenuItem().setIcon('play').setI18nLabel('pages.trailplanner.resume').setTextColor('success')
      .setVisible(() => !!this.trackBuilder.track && !this.trackBuilder.putAnchors && !this.trackBuilder.putFreeAnchor && !!this.map?.renderer && this.map.renderer.mapState.zoom >= this.minZoom)
      .setAction(() => { this.trackBuilder.resume(); this.toolbar?.refresh(); }),

    new MenuItem(),
    new MenuItem().setIcon('undo').setI18nLabel('pages.trailplanner.undo')
      .setVisible(() => !!this.trackBuilder.track)
      .setDisabled(() => this.trackBuilder.trackPoints.length === 0)
      .setAction(() => { this.trackBuilder.undo(); this.toolbar?.refresh(); }),
    new MenuItem().setIcon('reset').setI18nLabel('pages.trailplanner.reset').setTextColor('danger')
      .setVisible(() => !!this.trackBuilder.track)
      .setAction(() => this.reset()),

    new MenuItem(),
    new MenuItem().setIcon('save').setI18nLabel('buttons.save').setTextColor('success')
      .setVisible(() => !!this.trackBuilder.track)
      .setDisabled(() => this.trackBuilder.trackPoints.length < 2)
      .setAction(() => this.openSaveModal())
  ];

  connected$: Observable<boolean>;

  bothInfoAndElevationFitOnBottom = false;

  constructor(
    injector: Injector,
    public i18n: I18nService,
    collectionService: TrailCollectionService,
    networkService: NetworkService,
    private readonly auth: AuthService,
    private readonly browser: BrowserService,
  ) {
    super(injector);
    this.hover = new TrailHoverCursor(() => this.graph);
    this.whenAlive.add(collectionService.getMyCollectionsReady$()
    .subscribe(
      collections => this.collections = collectionService.sort(collections)
    ));
    this.connected$ = combineLatest([networkService.internet$, networkService.server$]).pipe(map(([i,s]) => i && !!s));
    this.whenVisible.subscribe(browser.resize$, size => this.updateSize(size.width, size.height));
    this.whenVisible.subscribe(
      combineLatest([this.trackBuilder.waysToCursor.permissive, this.trackBuilder.waysToCursor.forbidden]),
      () => this.updateLegend(),
    );
  }

  protected override getComponentState(): undefined { return undefined; }
  protected override onComponentStateChanged(): void {}

  private updateSize(width: number, height: number): void {
    this.bothInfoAndElevationFitOnBottom = width >= 300 + 800;
    this.changesDetection.detectChanges();
  }

  protected override initComponent(): void {
    this.updateSize(this.browser.width, this.browser.height);
    this._children$.pipe(
      map(children => children.find(child => child instanceof MapComponent)),
      filterDefined(),
      first(),
    ).subscribe(mapComponent => {
      this.map = mapComponent;
      this.trackBuilder.setMap(mapComponent);
      this.whenVisible.subscribe(
        mapComponent.renderer$.pipe(
          filterDefined(),
          switchMap(renderer => combineLatest([renderer.mapState.center$, renderer.mapState.zoom$])),
          debounceTime(200),
        ),
        () => {
          this.trackBuilder.mapChanged();
          this.trails.mapChanged();
        }
      );
    });
  }

  reset(): void {
    void this.injector.get(AlertController).create({
      header: this.i18n.texts.pages.trailplanner.reset_confirmation.title,
      message: this.i18n.texts.pages.trailplanner.reset_confirmation.message,
      buttons: [
        {
          text: this.i18n.texts.buttons.confirm,
          role: 'confirm',
          handler: () => {
            this.doReset();
            void this.injector.get(AlertController).dismiss();
          }
        }, {
          text: this.i18n.texts.buttons.cancel,
          role: 'cancel',
          handler: () => {
            void this.injector.get(AlertController).dismiss();
          }
        }
      ]
    }).then(p => p.present());
  }

  private doReset(): void {
    this.trackBuilder.reset();
    this.trailName = '';
    this.collectionUuid = undefined;
    this.toolbar?.refresh();
    this.map?.renderer?.invalidateSize();
  }

  openSaveModal(): void {
    if (this.trackBuilder.trackPoints.length < 2) return;
    void this.saveModal?.present();
  }

  save(): void {
    const collection = this.collections.find(c => c.uuid === this.collectionUuid);
    if (!collection) return;
    const trail = this.trackBuilder.save(collection, this.trailName);
    this.doReset();
    void this.injector.get(Router).navigateByUrl('/trail/' + encodeURIComponent(trail.owner) + '/' + encodeURIComponent(trail.uuid));
    void this.injector.get(ModalController).dismiss(null, 'ok');
  }

  getCollectionName(collection: TrailCollection): string {
    if (collection.name.length === 0 && collection.type === TrailCollectionType.MY_TRAILS)
      return this.i18n.texts.my_trails;
    return collection.name;
  }

  goToPlace(place: Place): void {
    if (place.north && place.south && place.east && place.west)
      this.map?.renderer?.fitBounds({minlat: place.south, maxlat: place.north, minlng: place.east, maxlng: place.west}, true);
    else if (place.lat && place.lng)
      this.map?.renderer?.goTo({lat: place.lat, lng: place.lng}, 14, true);
  }

  updateGraph(track: Track): void {
    const graph = this._children$.value.find(c => c instanceof TrailGraphComponent) as TrailGraphComponent;
    if (graph) {
      graph.updateTrack(track, undefined);
    }
  }

  private updateLegend(): void {
    const legend = document.getElementById('trail-planner-legend');
    if (!legend) return;
    const hasPermissive = this.trackBuilder.waysToCursor.permissive.value.length > 0;
    const hasForbidden = this.trackBuilder.waysToCursor.forbidden.value.length > 0;
    let html = '';
    // TODO refacto with dash
    if (hasPermissive)
      html += '<div style="display: flex; flex-direction: row; align-items: center; padding: 4px"><div style="height: 0; width: 25px; margin-right: 10px; border-bottom: 3px solid var(--way-permissive-color)"></div><div>' + this.i18n.texts.pages.trailplanner.legend.permissive + '</div></div>';
    if (hasForbidden)
      html += '<div style="display: flex; flex-direction: row; align-items: center; padding: 4px"><div style="height: 0; width: 25px; margin-right: 10px; border-bottom: 3px solid var(--way-forbidden-color)"></div><div>' + this.i18n.texts.pages.trailplanner.legend.forbidden + '</div></div>';
    legend.innerHTML = html;
    this.changesDetection.detectChanges();
  }

  /* TODO refacto
  mouseOverPointOnMap(event: MapTrackPointReference[]) {
    const closest = MapTrackPointReference.closest(event);
    if (closest?.track && closest.track === this.trackBuilder.currentMapTrack$.value)
      this.hover.mouseOverPointOnMap(closest);
  }*/

  graphPointHover(references: GraphPointReference[]) {
    this.hover.graphPointHover(references);
  }

  setBottomTab(tab: 'info' | 'elevation'): void {
    if (tab === this.bottomTab) return;
    this.bottomTab = tab;
    this.changesDetection.detectChanges();
  }

}

