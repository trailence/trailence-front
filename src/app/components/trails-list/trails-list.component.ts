import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Injector, Input, Output, SimpleChanges, ViewChild } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { CommonModule } from '@angular/common';
import { TrailOverviewComponent } from '../trail-overview/trail-overview.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrackService } from 'src/app/services/database/track.service';
import { IonModal, IonHeader, IonTitle, IonContent, IonFooter, IonToolbar, IonButton, IonButtons, IonIcon, IonLabel, IonRadio, IonRadioGroup,
  IonItem, IonCheckbox, IonList, IonSelectOption, IonSelect, IonInput, IonSpinner, PopoverController } from "@ionic/angular/standalone";
import { BehaviorSubject, combineLatest, debounceTime, filter, first, map, Observable, of, skip, switchMap } from 'rxjs';
import { ObjectUtils } from 'src/app/utils/object-utils';
import { ToggleChoiceComponent } from '../toggle-choice/toggle-choice.component';
import { Router } from '@angular/router';
import { FilterEnum, FilterNumeric, FilterTags, NumericFilterConfig, NumericFilterCustomConfig } from '../filters/filter';
import { FilterNumericComponent, NumericFilterValueEvent } from '../filters/filter-numeric/filter-numeric.component';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { MapComponent } from '../map/map.component';
import { TrailMenuService } from 'src/app/services/database/trail-menu.service';
import { TagService } from 'src/app/services/database/tag.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { TrailTag } from 'src/app/model/trail-tag';
import { FilterTagsComponent } from '../filters/filter-tags/filter-tags.component';
import { List } from 'immutable';
import { filterTimeout } from 'src/app/utils/rxjs/filter-timeout';
import { I18nPipe } from 'src/app/services/i18n/i18n-string';
import { MenuItem } from 'src/app/components/menus/menu-item';
import { TrailOverviewCondensedComponent } from '../trail-overview/condensed/trail-overview-condensed.component';
import { HorizontalGestureDirective } from 'src/app/utils/horizontal-gesture.directive';
import { ToolbarComponent } from '../menus/toolbar/toolbar.component';
import { HighlightService } from 'src/app/services/highlight/highlight.service';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { TrailCollection } from 'src/app/model/trail-collection';
import { ModerationService } from 'src/app/services/moderation/moderation.service';
import { Console } from 'src/app/utils/console';
import { TrackMetadataConfig } from '../track-metadata/track-metadata.component';
import { Filters, FiltersUtils } from './filters';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { TrailInfo } from 'src/app/services/fetch-source/fetch-source.interfaces';
import { isPublicationCollection } from 'src/app/model/dto/trail-collection';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { Tag } from 'src/app/model/tag';
import { TrackMetadataSnapshot } from 'src/app/model/snapshots';
import { TrailLoopType } from 'src/app/model/dto/trail-loop-type';
import { ComputedPreferences } from 'src/app/services/preferences/preferences';
import { FilterNumericCustomComponent } from '../filters/filter-numeric-custom/filter-numeric-custom.component';
import { Arrays } from 'src/app/utils/arrays';

const LOCALSTORAGE_KEY_LISTSTATE = 'trailence.list-state.';

interface State {
  mode: 'detailed' | 'condensed' | 'detailed_small_map';
  sortAsc: boolean;
  sortBy: string;
  filters: Filters;
}

const defaultState: State = {
  mode: 'detailed',
  sortAsc: false,
  sortBy: 'track.startDate',
  filters: FiltersUtils.createEmpty(),
}

interface TrailWithInfo {
  trail: Trail;
  track: TrackMetadataSnapshot | null;
  trailTags: TrailTag[];
  selected: boolean;
  info: TrailInfo | null;
}

@Component({
    selector: 'app-trails-list',
    templateUrl: './trails-list.component.html',
    styleUrls: ['./trails-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [IonSpinner, IonInput, IonList, IonSelect, IonSelectOption,
        IonCheckbox, IonItem, IonRadioGroup, IonRadio, IonLabel, IonIcon, IonButtons, IonButton,
        IonToolbar, IonFooter, IonContent, IonTitle, IonHeader, IonModal,
        CommonModule,
        TrailOverviewComponent,
        TrailOverviewCondensedComponent,
        ToggleChoiceComponent,
        FilterNumericComponent,
        FilterNumericCustomComponent,
        FilterTagsComponent,
        I18nPipe,
        HorizontalGestureDirective,
        ToolbarComponent,
    ]
})
export class TrailsListComponent extends AbstractComponent {

  @Input() trails$?: List<Observable<Trail | null>>;
  @Input() collectionUuid?: string;
  @Input() listType?: string;

  @Input() size: 'large' | 'medium' | 'small' = 'large';

  @Input() map?: MapComponent;
  @Input() listId!: string;
  @Input() message?: string;
  @Input() enableRemoveByGesture = false;
  @Input() showPublished = false;
  @Input() searching = false;
  @Input() onlyBubbles = false;
  @Input() enableShowOnMap = false;

  id = IdGenerator.generateId();
  highlighted?: Trail;

  @Output() trailClick = new EventEmitter<Trail>();
  @Output() showOnMap = new EventEmitter<Trail>();
  @Output() mapFilteredTrails = new EventEmitter<Trail[]>();

  state$ = new BehaviorSubject<State>(defaultState);
  filters$ = new BehaviorSubject<Filters | undefined>(undefined);

  collection?: TrailCollection;
  allTrails: TrailWithInfo[] = [];
  mapTrails: TrailWithInfo[] = [];
  listTrails: List<TrailWithInfo> = List();
  searchOpen = false;
  hasRating = false;

  collectionTags: Tag[] = [];

  durationFormatter = (value: number) => this.i18n.hoursToString(value);
  isPositive = (value: any) => typeof value === 'number' && value > 0;

  loopTypes = Object.values(TrailLoopType);

  toolbar: MenuItem[] = [];
  emptyListTools = [
    new MenuItem().setIcon('add-circle').setI18nLabel('tools.import').setAction(() => this.import())
  ];

  @ViewChild('sortModal') sortModal?: IonModal;
  @ViewChild('filtersModal') filtersModal?: IonModal;

  metadataConfig: TrackMetadataConfig = {
    mergeDurationAndEstimated: true,
    showBreaksDuration: false,
    showHighestAndLowestAltitude: true,
    allowSmallOnOneLine: true,
    mayHave2Values: false,
    alwaysShowElevation: false,
    showSpeed: false,
  };

  constructor(
    injector: Injector,
    public i18n: I18nService,
    private readonly trackService: TrackService,
    private readonly trailMenuService: TrailMenuService,
    changeDetector: ChangeDetectorRef,
    private readonly router: Router,
    private readonly preferences: PreferencesService,
    private readonly tagService: TagService,
    private readonly authService:AuthService,
    componentElement: ElementRef,
    private readonly highlightService: HighlightService,
  ) {
    super(injector);
    changeDetector.detach();
    let currentDistanceUnit = preferences.preferences.distanceUnit;
    let currentLang = preferences.preferences.lang;
    this.whenVisible.subscribe(preferences.preferences$,
      prefs => {
        let changed = false;
        if (currentDistanceUnit !== prefs.distanceUnit) {
          currentDistanceUnit = prefs.distanceUnit;
          this.state$.value.filters.distance = { from: undefined, to: undefined };
          this.state$.value.filters.positiveElevation = { from: undefined, to: undefined };
          this.state$.value.filters.negativeElevation = { from: undefined, to: undefined };
          changed = true;
        }
        if (changed)
          this.state$.next({...this.state$.value, filters: {...this.state$.value.filters}});
        if (currentLang !== prefs.lang) {
          currentLang = prefs.lang;
          i18n.langLoaded$.pipe(first(l => l === currentLang)).subscribe(() => {
            this.toolbar = [...this.toolbar];
            this.changesDetection.detectChanges();
          });
        }
      },
      true
    );
    this.ngZone.runOutsideAngular(() => {
      this.state$.pipe(
        skip(1)
      ).subscribe(() => this.saveState());
    });
    let timeout: any;
    this.visible$.subscribe(visible => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      if (!visible) {
        componentElement.nativeElement.style.display = 'none';
      } else {
        timeout = setTimeout(() => {
          timeout = undefined;
          componentElement.nativeElement.style.display = '';
          if (this.highlighted) {
            const h = this.highlighted;
            this.highlighted = undefined;
            this.setHighlighted(h);
          }
        }, 25);
      }
    });
    this.searchValue$.pipe(
      debounceTime(500)
    ).subscribe(search => {
      this.state$.next({
        ...this.state$.value,
        filters: { ...this.state$.value.filters, search }
      });
    });
    this.whenAlive.add(preferences.preferences$.subscribe(prefs => this.configureFilters(prefs)));
  }

  protected override initComponent(): void {
    let previousFilters: Filters | undefined = undefined;
    this.state$.subscribe(state => {
      if (state.filters !== previousFilters) {
        previousFilters = state.filters;
        this.filters$.next(FiltersUtils.toSystemUnit(state.filters, this.preferences.preferences, this.i18n));
      }
    });
  }

  protected override getComponentState() {
    return {
      trails$: this.trails$,
      collectionUuid: this.collectionUuid,
      map: this.map,
      listId: this.listId,
    }
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    if (newState?.listId !== previousState?.listId)
      this.loadState();

    const trails$ = this.trails$ ? this.trails$.toArray() : [];
    this.byState.add(this.ngZone.runOutsideAngular(() =>
      combineLatest([this.visible$, this.map?.visible$ ?? of(false)]).pipe(
        filter(([thisVisible, mapVisible]) => thisVisible || mapVisible),
        switchMap(() => combineLatest([
          this.collectionUuid && this.authService.email ? this.injector.get(TrailCollectionService).getCollection$(this.collectionUuid, this.authService.email) : of(undefined),
          (trails$.length === 0 ? of([]) : combineLatest(trails$)).pipe(
            map(trails => trails.filter(t => !!t)),
            debounceTimeExtended(0, 250, -1, (p, n) => p.length !== n.length),
          ),
        ])),
        map(([collection, trails]) => {
          this.collection = collection ?? undefined;
          this.updateToolbar(trails);
          // if no active filter, we can early emit the list of trails to the map
          if (this.nbActiveFilters() === 0)
            this.mapFilteredTrails.emit(trails);
          return trails.map(
            trail => combineLatest([
              trail.currentTrackUuid$.pipe(
                switchMap(trackUuid => trail.fromModeration ? this.injector.get(ModerationService).getTrackMetadata$(trail.uuid, trail.owner, trackUuid) : this.trackService.getMetadata$(trackUuid, trail.owner)),
                filterTimeout(track => !!track, 1000, () => null as TrackMetadataSnapshot | null)
              ),
              trail.owner === this.authService.email ? this.tagService.getTrailTagsWhenLoaded$(trail.uuid) : of([]),
              trail.owner.indexOf('@') < 0 ? this.injector.get(FetchSourceService).getTrailInfo$(trail.owner, trail.uuid) : of(null),
            ]).pipe(
              map(([track, trailTags, info]) => ({
                trail,
                track,
                trailTags,
                info,
                selected: false,
              }) as TrailWithInfo)
            )
          );
        }),
        switchMap(trailsWithInfo$ => trailsWithInfo$.length > 0 ? combineLatest(trailsWithInfo$) : of([])),
        debounceTimeExtended(0, 250, -1, (p, n) => p.length !== n.length),
      ).subscribe((trailsWithInfo) => {
        const newList = [];
        for (const t of trailsWithInfo) {
          const current = this.allTrails.find(c => c.trail.uuid === t.trail.uuid && c.trail.owner === t.trail.owner);
          if (current && t.trail === current.trail && t.track === current.track && t.info === current.info) {
            newList.push(current);
            if (!Arrays.sameContent(t.trailTags, current.trailTags)) {
              current.trailTags = t.trailTags;
            }
          } else {
            newList.push(t);
            if (current?.selected) t.selected = true;
          }
        }
        this.allTrails = newList;
        this.applySort(this.applyFilters());
        if (this.highlighted) {
          const h = this.highlighted;
          const ti = this.listTrails.find(t => t.trail.uuid === h.uuid && t.trail.owner === h.owner);
          this.highlighted = ti?.trail;
        }
        this.changesDetection.detectChanges();
      })
    ));

    let previous = this.state$.value;
    let previousMapCenter: L.LatLngLiteral | undefined = undefined;
    let previousMapZoom: number | undefined = undefined;
    this.byStateAndVisible.subscribe(
      this.state$.pipe(
        skip(1),
        debounceTime(100),
        switchMap(state => {
          if (!state.filters.onlyVisibleOnMap || !this.map) return of([state, undefined, undefined] as [State, L.LatLngLiteral | undefined, number | undefined]);
          return combineLatest([this.map.getState().center$, this.map.getState().zoom$]).pipe(
            debounceTime(100),
            map(([mapCenter, mapZoom]) => ([state, mapCenter, mapZoom] as [State, L.LatLngLiteral | undefined, number | undefined]))
          )
        })
      ),
      ([state, mapCenter, mapZoom]) => {
        if (state === previous && mapCenter === previousMapCenter && mapZoom === previousMapZoom) return;
        if (state.filters !== previous.filters || mapCenter !== previousMapCenter || mapZoom !== previousMapZoom) {
          this.applySort(this.applyFilters());
          this.toolbar = [...this.toolbar];
          this.changesDetection.detectChanges();
        } else if (state.sortAsc !== previous.sortAsc || state.sortBy !== previous.sortBy) {
          this.applySort(this.listTrails);
          this.toolbar = [...this.toolbar];
          this.changesDetection.detectChanges();
        }
        previous = state;
        previousMapCenter = mapCenter;
        previousMapZoom = mapZoom;
      },
      true
    );
    if (this.collectionUuid)
      this.byStateAndVisible.subscribe(
        this.tagService.getAllTags$().pipe(
          collection$items(),
          map(list => list.filter(t => t.collectionUuid === this.collectionUuid))
        ),
        tags => {
          this.collectionTags = tags;
          if (this.state$.value.filters.search.length > 0) this.state$.next({...this.state$.value, filters: {...this.state$.value.filters}});
        }
      );
  }

  private updateToolbar(trails: Trail[]): void {
    this.toolbar = [
      new MenuItem().setIcon('sort').setI18nLabel('tools.sort')
        .setDisabled(() => trails.length === 0)
        .setAction(() => this.sortModal?.present()),
      new MenuItem().setIcon('filters').setI18nLabel('tools.filters')
        .setAction(() => this.filtersModal?.present())
        .setBadgeTopRight(() => {
          const nb = this.nbActiveFilters();
          if (nb === 0) return undefined;
          return { text: '' + nb, color: 'success', fill: true };
        }),
    ];

    // display
    this.toolbar.push(
      new MenuItem().setIcon('list-items').setI18nLabel('tools.display')
        .setDisabled(() => trails.length === 0)
        .setChildren([
          new MenuItem().setIcon('list-detailed').setI18nLabel('tools.display_detailed')
            .setSelected(() => this.state$.value.mode === 'detailed')
            .setAction(() => this.setListMode('detailed')),
          new MenuItem().setIcon('map').setI18nLabel('tools.display_detailed_small_map')
            .setSelected(() => this.state$.value.mode === 'detailed_small_map')
            .setAction(() => this.setListMode('detailed_small_map')),
          new MenuItem().setIcon('list-condensed').setI18nLabel('tools.display_condensed')
            .setSelected(() => this.state$.value.mode === 'condensed')
            .setAction(() => this.setListMode('condensed')),
        ]),
    );

    // import
    if (this.collection && !isPublicationCollection(this.collection.type) && this.collection.owner === this.authService.email) {
      this.toolbar.push(
        new MenuItem().setIcon('add-circle').setI18nLabel('tools.import')
          .setAction(() => import('../../services/functions/import').then(m => m.openImportTrailsDialog(this.injector, this.collectionUuid!)))
      );
    }
  }

  protected override onChangesBeforeCheckComponentState(changes: SimpleChanges): void {
    if (changes['message'] || changes['searching']) this.changesDetection.detectChanges();
  }

  protected override destroyComponent(): void {
    this.clearHighlights();
  }

  private applyFilters(): TrailWithInfo[] {
    const filters = FiltersUtils.toSystemUnit(this.state$.value.filters, this.preferences.preferences, this.i18n);
    this.clearHighlights();
    const searchTextRanges = new Map<string, {text: string, name: number, location: number, inTags: boolean}>();
    this.mapTrails = this.allTrails.filter(
      t => { // NOSONAR
        if (filters.search.trim().length > 0) {
          const s = filters.search.trim().toLowerCase();
          const inName = t.trail.name.toLowerCase().indexOf(s);
          const inLocation = t.trail.location.toLowerCase().indexOf(s);
          const tags = this.collectionTags.filter(t => t.name.toLowerCase().indexOf(s) >= 0).map(t => t.uuid);
          const inTags = tags.length === 0 ? false : !!t.trailTags.find(t => tags.indexOf(t.tagUuid) >= 0);
          if (inName < 0 && inLocation < 0 && !inTags) return false;
          searchTextRanges.set(t.trail.uuid + '-' + t.trail.owner, {text: s, name: inName, location: inLocation, inTags});
        }
        if (filters.duration.from !== undefined || filters.duration.to !== undefined) {
          let duration = t.track?.duration;
          if (duration !== undefined && t.track?.breaksDuration !== undefined) duration -= t.track.breaksDuration;
          if (filters.duration.from !== undefined && (duration === undefined || duration < filters.duration.from)) return false;
          if (filters.duration.to !== undefined && (duration === undefined || duration > filters.duration.to)) return false;
        }
        if (filters.estimatedDuration.from !== undefined && (t.track?.estimatedDuration === undefined || t.track.estimatedDuration < filters.estimatedDuration.from)) return false;
        if (filters.estimatedDuration.to !== undefined && (t.track?.estimatedDuration === undefined || t.track.estimatedDuration > filters.estimatedDuration.to)) return false;
        if (filters.distance.from !== undefined && (t.track?.distance === undefined || t.track.distance < filters.distance.from)) return false;
        if (filters.distance.to !== undefined && (t.track?.distance === undefined || t.track.distance > filters.distance.to)) return false;
        if (filters.positiveElevation.from !== undefined && (t.track?.positiveElevation === undefined || t.track.positiveElevation < filters.positiveElevation.from)) return false;
        if (filters.positiveElevation.to !== undefined && (t.track?.positiveElevation === undefined || t.track.positiveElevation > filters.positiveElevation.to)) return false;
        if (filters.negativeElevation.from !== undefined && (t.track?.negativeElevation === undefined || t.track.negativeElevation < filters.negativeElevation.from)) return false;
        if (filters.negativeElevation.to !== undefined && (t.track?.negativeElevation === undefined || t.track.negativeElevation > filters.negativeElevation.to)) return false;
        if (filters.loopTypes.selected !== undefined && (t.trail.loopType === undefined || filters.loopTypes.selected.indexOf(t.trail.loopType) < 0)) return false;
        if (filters.activities.selected !== undefined && filters.activities.selected.indexOf(t.trail.activity) < 0) return false;
        if (filters.rate.from !== undefined && (t.info?.rating === undefined || t.info.rating < filters.rate.from)) return false;
        if (filters.rate.to !== undefined && (t.info?.rating !== undefined && t.info.rating > filters.rate.to)) return false;
        if (filters.tags.type === 'onlyWithAnyTag') {
          if (t.trailTags.length === 0) return false;
        } else if (filters.tags.type === 'onlyWithoutAnyTag') {
          if (t.trailTags.length !== 0) return false;
        } else if (filters.tags.tagsUuids.length > 0) {
          const uuids = t.trailTags.map(tag => tag.tagUuid);
          switch (filters.tags.type) {
            case 'include_and':
              for (const uuid of filters.tags.tagsUuids) if (uuids.indexOf(uuid) < 0) return false;
              break;
            case 'include_or':
              if (!uuids.some(uuid => filters.tags.tagsUuids.indexOf(uuid) >= 0)) return false;
              break;
            case 'exclude':
              if (uuids.some(uuid => filters.tags.tagsUuids.indexOf(uuid) >= 0)) return false;
              break;
          }
        }
        return true;
      }
    );
    this.refreshHighlights(searchTextRanges);
    const mapBounds = this.map?.getBounds();
    if (this.trails$)
      this.mapFilteredTrails.emit(this.mapTrails.map(t => t.trail));
    if (filters.onlyVisibleOnMap && mapBounds) {
      return this.mapTrails.filter(t => {
        const b = t.track?.bounds;
        return !b || mapBounds.overlaps(b);
      });
    }
    this.hasRating = !!this.mapTrails.find(t => t.info?.rating !== undefined);
    return this.mapTrails;
  }

  private applySort(trails: TrailWithInfo[] | List<TrailWithInfo>): void {
    this.listTrails = List(trails.sort((a,b) => this.compareTrails(a, b)));
  }

  private compareTrails(a: TrailWithInfo, b: TrailWithInfo): number {
    const field = this.state$.value.sortBy;
    let diff;
    if (field === 'track.duration') {
      let d1 = a.track?.duration;
      if (d1 !== undefined && a.track?.breaksDuration !== undefined) d1 -= a.track?.breaksDuration;
      let d2 = b.track?.duration;
      if (d2 !== undefined && b.track?.breaksDuration !== undefined) d2 -= b.track?.breaksDuration;
      diff = ObjectUtils.compare(d1, d2);
    } else if (field === 'track.startDate') {
      const d1 = a.trail.date ?? a.track?.startDate;
      const d2 = b.trail.date ?? b.track?.startDate;
      diff = ObjectUtils.compare(d1, d2);
    } else {
      diff = ObjectUtils.compare(ObjectUtils.extractField(a, field), ObjectUtils.extractField(b, field));
    }
    return this.state$.value.sortAsc ? diff : -diff;
  }

  private loadState(): void {
    const stateStr = localStorage.getItem(LOCALSTORAGE_KEY_LISTSTATE + this.listId);
    if (!stateStr) this.state$.next(defaultState);
    else {
      const newState = JSON.parse(stateStr);
      let valid = true;
      const properties = Object.getOwnPropertyNames(newState);
      for (const key in defaultState) {
        if (properties.indexOf(key) < 0) {
          valid = false;
          break;
        }
      }
      if (valid) {
        newState.filters = FiltersUtils.fix(newState.filters);
        if (this.listType !== 'search' && this.listType !== 'my-selection' && this.listType !== 'my-publications') newState.filters.rate = {from: undefined, to: undefined};
        this.state$.next(newState);
        if (newState.filters.search) this.searchOpen = true;
      } else
        this.state$.next(defaultState);
    }
  }

  private saveState(): void {
    const state = this.state$.value;
    if (state === defaultState) localStorage.removeItem(LOCALSTORAGE_KEY_LISTSTATE + this.listId);
    else localStorage.setItem(LOCALSTORAGE_KEY_LISTSTATE + this.listId, JSON.stringify(state));
  }

  public setListMode(mode: any): void {
    if (this.state$.value.mode === mode || (mode !== 'condensed' && mode !== 'detailed' && mode != 'detailed_small_map')) return;
    this.state$.next({...this.state$.value, mode: mode});
    this.changesDetection.detectChanges();
  }

  public get nbShown(): number {
    return this.listTrails.size
  }

  public get nbSelected(): number {
    return this.listTrails.reduce((nb, trail) => nb + (trail.selected ? 1 : 0), 0);
  }

  private inSelectAll = false;
  selectAll(event: any): void {
    if (this.inSelectAll) return;
    this.inSelectAll = true;
    const selected = this.nbSelected === 0;
    event.target.setChecked(selected);
    this.inSelectAll = false;
    this.listTrails.forEach(t => {
      t.selected = selected;
      return true;
    });
    this.toolbar = [...this.toolbar];
    this.changesDetection.detectChanges();
  }

  onTrailSelected(): void {
    this.toolbar = [...this.toolbar];
    this.changesDetection.detectChanges();
  }

  getSelectedTrails(): Trail[] {
    return this.listTrails.toArray().filter(t => t.selected).map(t => t.trail);
  }

  sortBy(name: string): void {
    if (this.state$.value.sortBy === name) return;
    this.state$.next({...this.state$.value, sortBy: name});
  }

  sortAsc(asc: boolean): void {
    if (this.state$.value.sortAsc === asc) return;
    this.state$.next({...this.state$.value, sortAsc: asc});
  }

  filterDurationConfig: NumericFilterCustomConfig = {
    range: true,
    values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 24],
    formatter: this.durationFormatter
  };

  filterDistanceConfig!: NumericFilterCustomConfig;
  filterElevationConfig!: NumericFilterCustomConfig;

  private configureFilters(prefs: ComputedPreferences): void {
    switch (prefs.distanceUnit) {
      case 'METERS':
        this.filterDistanceConfig = {
          range: true,
          values: [0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 17, 20, 25, 30, 40, 50],
          formatter: (value: number) => value + ' km'
        };
        this.filterElevationConfig = {
          range: true,
          values: [0, 50, 100, 200, 300, 400, 500, 600, 800, 1000, 1250, 1500, 2000],
          formatter: (value: number) => value + ' m'
        };
        break;
      case 'IMPERIAL':
        this.filterDistanceConfig = {
          range: true,
          values: [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 17, 20, 25, 30],
          formatter: (value: number) => value + ' mi'
        };
        this.filterElevationConfig = {
          range: true,
          values: [0, 200, 500, 800, 1100, 1400, 1700, 2000, 2500, 3000, 4000, 5000, 6000, 7000],
          formatter: (value: number) => value + ' ft'
        };
        break;
    }
  }

  updateNumericFilter(filter: FilterNumeric, $event: NumericFilterValueEvent): void {
    const newMin = $event.min === $event.valueMin ? undefined : $event.valueMin;
    const newMax = $event.max === $event.valueMax ? undefined : $event.valueMax;
    if (filter.from === newMin && filter.to === newMax) return;
    filter.from = newMin;
    filter.to = newMax;
    this.state$.next({
      ...this.state$.value,
      filters: { ...this.state$.value.filters }
    });
  }

  updateNumericCustomFilter(filter: FilterNumeric, config: NumericFilterCustomConfig, $event: FilterNumeric | number): void {
    const event = $event as FilterNumeric;
    this.updateNumericFilter(filter, {valueMin: event.from! , valueMax: event.to!, min: config.values[0], max: config.values[config.values.length - 1]});
  }

  updateFilterOnlyVisibleOnMap(checked: boolean): void {
    if (checked === this.state$.value.filters.onlyVisibleOnMap) return;
    this.state$.next({
      ...this.state$.value,
      filters: { ...this.state$.value.filters, onlyVisibleOnMap: checked }
    });
  }

  updateEnumFilter(filter: FilterEnum<any>, $event: string[]): void {
    const selected = $event.length > 0 ? $event : undefined;
    if (filter.selected === selected) return;
    filter.selected = selected;
    this.state$.next({
      ...this.state$.value,
      filters: { ...this.state$.value.filters }
    });
  }

  updateTagsFilter(filter: FilterTags): void {
    this.state$.next({
      ...this.state$.value,
      filters: { ...this.state$.value.filters, tags: filter }
    });
  }

  nbActiveFilters(): number {
    return FiltersUtils.nbActives(this.state$.value.filters);
  }

  resetFilters(): void {
    const filters = this.state$.value.filters;
    FiltersUtils.reset(filters);
    this.state$.next({...this.state$.value, filters: {...filters}});
  }


  formatRate = (rate: number) => rate.toLocaleString(this.preferences.preferences.lang, {maximumFractionDigits: 1});

  getSelectedActivitiesButtonText(): string {
    if (this.state$.value.filters.activities.selected?.length) {
      return this.state$.value.filters.activities.selected.map(activity => this.i18n.texts.activity[activity ?? 'unspecified']).join(', ');
    }
    return this.i18n.texts.pages.trails.filters.select_activities_button;
  }

  openActivitiesDialog(): void {
    import('../activity-popup/activity-popup.component')
    .then(m => m.openActivitiesSelectionPopup(
      this.injector,
      this.state$.value.filters.activities.selected || [],
      newSelection => {
        const newValue = newSelection.length === 0 ? undefined : newSelection;
        const filter = this.state$.value.filters.activities;
        if (filter.selected === newValue) return;
        filter.selected = newValue;
        this.state$.next({
          ...this.state$.value,
          filters: { ...this.state$.value.filters }
        });
      }
    ));
  }

  private trailClicked?: Trail;
  private trailClickTimestamp = 0;
  onTrailClick(trail: Trail): void {
    if (this.trailClicked === trail && Date.now() - this.trailClickTimestamp < 750) {
      this.openTrail(trail);
      this.trailClicked = undefined;
      return;
    }
    this.trailClicked = trail;
    this.trailClickTimestamp = Date.now();
    this.trailClick.emit(trail);
  }

  setHighlighted(trail?: Trail): void {
    if (trail === this.highlighted) return;
    this.highlighted = trail;
    if (trail) {
      const element = document.getElementById('trail-list-' + this.id + '-trail-' + trail.uuid + '-' + trail.owner);
      if (element) {
        const parent = element.parentElement;
        if (parent) {
          this.scrollTo(parent, element, 0);
        }
      }
    }
    this.changesDetection.detectChanges();
  }

  private scrollTo(parent: HTMLElement, element: HTMLElement, trial: number): void {
    const scrollPos = parent.scrollTop;
    const totalHeight = parent.offsetHeight;
    const top = element.offsetTop - parent.offsetTop;
    const bottom = top + element.offsetHeight;
    if (top < scrollPos) {
      parent.scrollTo(0, top);
    } else if (bottom > scrollPos + totalHeight) {
      parent.scrollTo(0, bottom - totalHeight + 25);
    } else {
      return;
    }
    if (trial >= 10) return;
    setTimeout(() => this.scrollTo(parent, element, trial + 1), 100);
  }

  import(): void {
    import('../../services/functions/import').then(m => m.openImportTrailsDialog(this.injector, this.collectionUuid!));
  }

  openTrail(trail: Trail): void {
    this.router.navigate(['trail', trail.owner, trail.uuid], {queryParams: { from: this.router.url }});
  }

  share(): void {
    import('../share-popup/share-popup.component').then(m => m.openSharePopup(this.injector, this.collectionUuid!, []));
  }

  removeFromList(trailWithInfo: TrailWithInfo): void {
    const index = this.allTrails.indexOf(trailWithInfo);
    if (index >= 0) {
      this.allTrails.splice(index, 1);
      this.applySort(this.applyFilters());
      if (this.highlighted === trailWithInfo.trail) {
        this.highlighted = undefined;
      }
      this.changesDetection.detectChanges();
    }
  }

  toggleSearch(): void {
    if (this.searchOpen) {
      this.searchOpen = false;
    } else {
      this.searchOpen = true;
      setTimeout(() => {
        const input = document.getElementById('search-trail-' + this.id) as any;
        if (input?.setFocus) input.setFocus();
      }, 100);
    }
    this.changesDetection.detectChanges();
  }

  searchValue$ = new EventEmitter<string>();
  searchTrailInput(event: string | null | undefined): void {
    this.searchValue$.emit(event ?? '');
  }
  clearSearch(): void {
    this.state$.next({
      ...this.state$.value,
      filters: { ...this.state$.value.filters, search: '' }
    });
  }

  private highlightRanges: Range[] = [];
  private clearHighlights(): void {
    for (const r of this.highlightRanges) this.highlightService.removeSearchText(r);
    this.highlightRanges = [];
  }

  private highlightTimeout: any;
  private refreshHighlights(ranges: Map<string, {text: string, name: number, location: number, inTags: boolean}>, delay: number = 0, trial: number = 1): void {
    if (this.highlightTimeout) clearTimeout(this.highlightTimeout);
    this.highlightTimeout = setTimeout(() => {
      this.clearHighlights();
      let retry = false;
      ranges.forEach((pos, key) => {
        const trailElement = document.getElementById('trail-list-' + this.id + '-trail-' + key);
        if (!trailElement) return;
        try {
          if (pos.name >= 0) {
            const trailName = trailElement.getElementsByClassName('trail-name');
            if (trailName.length > 0) {
              const element = trailName.item(0)!.firstElementChild!.firstChild!;
              const range = new Range();
              range.setStart(element, pos.name);
              range.setEnd(element, pos.name + pos.text.length);
              this.highlightRanges.push(range);
              this.highlightService.addSearchText(range);
            }
          }
          if (pos.location >= 0) {
            const trailLocation = trailElement.getElementsByClassName('trail-location');
            if (trailLocation.length > 0) {
              const element = trailLocation.item(0)!.firstChild!;
              const range = new Range();
              range.setStart(element, pos.location);
              range.setEnd(element, pos.location + pos.text.length);
              this.highlightRanges.push(range);
              this.highlightService.addSearchText(range);
            }
          }
          if (pos.inTags) {
            const tags = trailElement.getElementsByClassName('tag');
            for (let i = 0; i < tags.length; ++i) {
              const tagElement = tags.item(i) as HTMLElement;
              const tagText = tagElement.innerText;
              const textIndex = tagText.toLowerCase().indexOf(pos.text);
              if (textIndex >= 0) {
                const element = tagElement.firstChild!;
                const range = new Range();
                range.setStart(element, textIndex);
                range.setEnd(element, textIndex + pos.text.length);
                this.highlightRanges.push(range);
                this.highlightService.addSearchText(range);
              }
            }
          }
        } catch (e) { // NOSONAR
          Console.warn('Cannot select range, may be not yet loaded, will try');
          retry = true;
        }
      });
      if (retry && trial < 5) {
        this.refreshHighlights(ranges, 100 * trial, trial + 1);
      }
    }, delay);
  }

  openSelectionMenu(event: MouseEvent): void {
    import('../menus/menu-content/menu-content.component')
    .then(module => this.injector.get(PopoverController).create({
      component: module.MenuContentComponent,
      componentProps: {
       menu: this.trailMenuService.getTrailsMenu(this.getSelectedTrails(), false, this.collection, false, this.listType === 'all-collections', this.listType === 'moderation'),
       enableToolbarsForSections: 2
      },
      event: event,
      side: 'bottom',
      dismissOnSelect: true,
      cssClass: 'always-tight-menu',
    })).then(p => p.present());
  }

}
