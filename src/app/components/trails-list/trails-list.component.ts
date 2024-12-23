import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Injector, Input, Output, SimpleChanges } from '@angular/core';
import { Trail, TrailLoopType } from 'src/app/model/trail';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { CommonModule } from '@angular/common';
import { TrailOverviewComponent } from '../trail-overview/trail-overview.component';
import { IconLabelButtonComponent } from '../icon-label-button/icon-label-button.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrackService } from 'src/app/services/database/track.service';
import { IonModal, IonHeader, IonTitle, IonContent, IonFooter, IonToolbar, IonButton, IonButtons, IonIcon, IonLabel, IonRadio, IonRadioGroup,
  IonItem, IonCheckbox, IonPopover, IonList, IonSelectOption, IonSelect, PopoverController, IonSegment, IonSegmentButton } from "@ionic/angular/standalone";
import { BehaviorSubject, combineLatest, debounceTime, map, of, skip, switchMap } from 'rxjs';
import { ObjectUtils } from 'src/app/utils/object-utils';
import { ToggleChoiceComponent } from '../toggle-choice/toggle-choice.component';
import { Router } from '@angular/router';
import { TrackMetadataSnapshot } from 'src/app/services/database/track-database';
import { MenuContentComponent } from '../menu-content/menu-content.component';
import { FilterEnum, FilterNumeric, FilterTags, NumericFilterConfig } from '../filters/filter';
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
import { MenuItem } from 'src/app/utils/menu-item';
import { TrailOverviewCondensedComponent } from '../trail-overview/condensed/trail-overview-condensed.component';
import { HorizontalGestureDirective } from 'src/app/utils/horizontal-gesture.directive';

const LOCALSTORAGE_KEY_LISTSTATE = 'trailence.list-state.';

interface State {
  mode: 'detailed' | 'condensed';
  sortAsc: boolean;
  sortBy: string;
  filters: Filters;
}

interface Filters {
  duration: FilterNumeric;
  estimatedDuration: FilterNumeric;
  distance: FilterNumeric;
  positiveElevation: FilterNumeric;
  negativeElevation: FilterNumeric;
  loopTypes: FilterEnum<TrailLoopType>;
  onlyVisibleOnMap: boolean;
  tags: FilterTags;
}

const defaultState: State = {
  mode: 'detailed',
  sortAsc: false,
  sortBy: 'track.startDate',
  filters: {
    duration: {
      from: undefined,
      to: undefined,
    },
    estimatedDuration: {
      from: undefined,
      to: undefined,
    },
    distance: {
      from: undefined,
      to: undefined,
    },
    positiveElevation: {
      from: undefined,
      to: undefined,
    },
    negativeElevation: {
      from: undefined,
      to: undefined,
    },
    loopTypes: {
      selected: undefined
    },
    onlyVisibleOnMap: false,
    tags: {
      tagsUuids: [],
      type: 'include_and',
    }
  }
}

interface TrailWithInfo {
  trail: Trail;
  track: TrackMetadataSnapshot | null;
  tags: TrailTag[];
  selected: boolean;
}

@Component({
    selector: 'app-trails-list',
    templateUrl: './trails-list.component.html',
    styleUrls: ['./trails-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [IonList, IonSelect, IonSelectOption,
        IonPopover, IonCheckbox, IonItem, IonRadioGroup, IonRadio, IonLabel, IonIcon, IonButtons, IonButton,
        IonToolbar, IonFooter, IonContent, IonTitle, IonHeader, IonModal, IonSegment, IonSegmentButton,
        CommonModule,
        TrailOverviewComponent,
        TrailOverviewCondensedComponent,
        IconLabelButtonComponent,
        ToggleChoiceComponent,
        MenuContentComponent,
        FilterNumericComponent,
        FilterTagsComponent,
        I18nPipe,
        HorizontalGestureDirective,
    ]
})
export class TrailsListComponent extends AbstractComponent {

  @Input() trails: List<Trail> = List();
  @Input() collectionUuid?: string;

  @Input() metadataClass = 'two-columns';

  @Input() map?: MapComponent;
  @Input() listId!: string;
  @Input() message?: string;
  @Input() enableRemoveByGesture = false;

  id = IdGenerator.generateId();
  highlighted?: Trail;

  @Output() trailClick = new EventEmitter<Trail>();
  @Output() mapFilteredTrails = new EventEmitter<Trail[]>();

  state$ = new BehaviorSubject<State>(defaultState);

  allTrails: TrailWithInfo[] = [];
  mapTrails: TrailWithInfo[] = [];
  listTrails: List<TrailWithInfo> = List();
  moreMenu: MenuItem[] = [];

  durationFormatter = (value: number) => this.i18n.hoursToString(value);
  isPositive = (value: any) => typeof value === 'number' && value > 0;

  loopTypes = Object.values(TrailLoopType);

  constructor(
    injector: Injector,
    public i18n: I18nService,
    private readonly trackService: TrackService,
    public trailMenuService: TrailMenuService,
    public changeDetector: ChangeDetectorRef,
    private readonly router: Router,
    private readonly preferences: PreferencesService,
    private readonly tagService: TagService,
    private readonly authService:AuthService,
    componentElement: ElementRef,
  ) {
    super(injector);
    changeDetector.detach();
    let currentDistanceUnit = preferences.preferences.distanceUnit;
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
        }, 25);
      }
    });
  }

  protected override getComponentState() {
    return {
      trails: this.trails,
      collectionUuid: this.collectionUuid,
    }
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    if (newState?.collectionUuid !== previousState?.collectionUuid)
      this.loadState();

    this.moreMenu = this.trailMenuService.getTrailsMenu(this.trails.toArray(), false, this.collectionUuid, true);

    // if no active filter, we can early emit the list of trails to the map
    if (!this.trails.isEmpty() && this.nbActiveFilters() === 0)
      this.mapFilteredTrails.emit(this.trails.toArray());

    this.byStateAndVisible.subscribe(
      this.trails.isEmpty() ? of([]) : combineLatest(
        this.trails.map(
          trail => combineLatest([
            trail.currentTrackUuid$.pipe(
              switchMap(trackUuid => this.trackService.getMetadata$(trackUuid, trail.owner)),
              filterTimeout(track => !!track, 1000, () => null as TrackMetadataSnapshot | null)
            ),
            trail.owner === this.authService.email ? this.tagService.getTrailTags$(trail.uuid) : of([])
          ]).pipe(
            map(([track, tags]) => ({
              trail,
              track,
              tags,
              selected: false,
            }) as TrailWithInfo)
          )
        ).toArray()
      ).pipe(
        debounceTimeExtended(0, 250, -1, (p, n) => p.length !== n.length)
      ),
      (trailsWithInfo) => {
        for (const t of trailsWithInfo) {
          const current = this.allTrails.find(c => c.trail.uuid === t.trail.uuid && c.trail.owner === t.trail.owner);
          if (current?.selected) t.selected = true;
        }
        this.allTrails = trailsWithInfo;
        this.applySort(this.applyFilters());
        if (this.highlighted) {
          const h = this.highlighted;
          const ti = this.listTrails.find(t => t.trail.uuid === h.uuid && t.trail.owner === h.owner);
          this.highlighted = ti?.trail;
        }
        this.changeDetector.detectChanges();
      },
      true
    );

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
          this.changeDetector.detectChanges();
        } else if (state.sortAsc !== previous.sortAsc || state.sortBy !== previous.sortBy) {
          this.applySort(this.listTrails);
          this.changeDetector.detectChanges();
        }
        previous = state;
        previousMapCenter = mapCenter;
        previousMapZoom = mapZoom;
      },
      true
    );
  }

  protected override onChangesBeforeCheckComponentState(changes: SimpleChanges): void {
    if (changes['message']) this.changeDetector.detectChanges();
  }

  private applyFilters(): TrailWithInfo[] {
    const filters = this.state$.value.filters;
    const distanceConverter = this.preferences.preferences.distanceUnit === 'METERS' ? 1000 : 5280;
    const minDistance = filters.distance.from === undefined ? undefined : this.i18n.distanceInMetersFromUserUnit(filters.distance.from * distanceConverter);
    const maxDistance = filters.distance.to === undefined ? undefined : this.i18n.distanceInMetersFromUserUnit(filters.distance.to * distanceConverter);
    const minPosEle = filters.positiveElevation.from === undefined ? undefined : this.i18n.elevationInMetersFromUserUnit(filters.positiveElevation.from);
    const maxPosEle = filters.positiveElevation.to === undefined ? undefined : this.i18n.elevationInMetersFromUserUnit(filters.positiveElevation.to);
    const minNegEle = filters.negativeElevation.from === undefined ? undefined : this.i18n.elevationInMetersFromUserUnit(filters.negativeElevation.from);
    const maxNegEle = filters.negativeElevation.to === undefined ? undefined : this.i18n.elevationInMetersFromUserUnit(filters.negativeElevation.to);
    this.mapTrails = this.allTrails.filter(
      t => { // NOSONAR
        if (filters.duration.from !== undefined || filters.duration.to !== undefined) {
          let duration = t.track?.duration;
          if (duration !== undefined && t.track?.breaksDuration !== undefined) duration -= t.track.breaksDuration;
          if (filters.duration.from !== undefined && (duration === undefined || duration < filters.duration.from * 60 * 60 * 1000)) return false;
          if (filters.duration.to !== undefined && (duration === undefined || duration > filters.duration.to * 60 * 60 * 1000)) return false;
        }
        if (filters.estimatedDuration.from !== undefined && (t.track?.estimatedDuration === undefined || t.track.estimatedDuration < filters.estimatedDuration.from * 60 * 60 * 1000)) return false;
        if (filters.estimatedDuration.to !== undefined && (t.track?.estimatedDuration === undefined || t.track.estimatedDuration > filters.estimatedDuration.to * 60 * 60 * 1000)) return false;
        if (minDistance !== undefined && (t.track?.distance === undefined || t.track.distance < minDistance)) return false;
        if (maxDistance !== undefined && (t.track?.distance === undefined || t.track.distance > maxDistance)) return false;
        if (minPosEle !== undefined && (t.track?.positiveElevation === undefined || t.track.positiveElevation < minPosEle)) return false;
        if (maxPosEle !== undefined && (t.track?.positiveElevation === undefined || t.track.positiveElevation > maxPosEle)) return false;
        if (minNegEle !== undefined && (t.track?.negativeElevation === undefined || t.track.negativeElevation < minNegEle)) return false;
        if (maxNegEle !== undefined && (t.track?.negativeElevation === undefined || t.track.negativeElevation > maxNegEle)) return false;
        if (filters.loopTypes.selected !== undefined && (t.trail.loopType === undefined || filters.loopTypes.selected.indexOf(t.trail.loopType) < 0)) return false;
        if (filters.tags.type === 'onlyWithAnyTag') {
          if (t.tags.length === 0) return false;
        } else if (filters.tags.type === 'onlyWithoutAnyTag') {
          if (t.tags.length !== 0) return false;
        } else if (filters.tags.tagsUuids.length > 0) {
          const uuids = t.tags.map(tag => tag.tagUuid);
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
    const mapBounds = this.map?.getBounds();
    this.mapFilteredTrails.emit(this.mapTrails.map(t => t.trail));
    if (filters.onlyVisibleOnMap && mapBounds) {
      return this.mapTrails.filter(t => {
        const b = t.track?.bounds;
        return !b || mapBounds.overlaps(b);
      });
    }
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
      if (valid)
        this.state$.next(newState);
      else
        this.state$.next(defaultState);
    }
  }

  private saveState(): void {
    const state = this.state$.value;
    if (state === defaultState) localStorage.removeItem(LOCALSTORAGE_KEY_LISTSTATE + this.listId);
    else localStorage.setItem(LOCALSTORAGE_KEY_LISTSTATE + this.listId, JSON.stringify(state));
  }

  public setListMode(mode: any): void {
    if (this.state$.value.mode === mode || (mode !== 'condensed' && mode !== 'detailed')) return;
    this.state$.next({...this.state$.value, mode: mode});
    this.changeDetector.detectChanges();
  }

  public get nbShown(): number {
    return this.listTrails.size
  }

  public get nbSelected(): number {
    return this.listTrails.reduce((nb, trail) => nb + (trail.selected ? 1 : 0), 0);
  }

  selectAll(selected: boolean): void {
    this.listTrails.forEach(t => {
      t.selected = selected;
      return true;
    });
    this.changeDetector.detectChanges();
  }

  onTrailSelected(): void {
    this.changeDetector.detectChanges();
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
    let nb = 0;
    const filters = this.state$.value.filters;
    if (filters.duration.from !== undefined || filters.duration.to !== undefined) nb++;
    if (filters.distance.from !== undefined || filters.distance.to !== undefined) nb++;
    if (filters.positiveElevation.from !== undefined || filters.positiveElevation.to !== undefined) nb++;
    if (filters.negativeElevation.from !== undefined || filters.negativeElevation.to !== undefined) nb++;
    if (filters.loopTypes.selected) nb++;
    if (filters.onlyVisibleOnMap) nb++;
    if (filters.tags.type === 'onlyWithAnyTag' || filters.tags.type === 'onlyWithoutAnyTag' || filters.tags.tagsUuids.length !== 0) nb++;
    return nb;
  }

  resetFilters(): void {
    const filters = this.state$.value.filters;
    filters.duration.from = undefined;
    filters.duration.to = undefined;
    filters.distance.from = undefined;
    filters.distance.to = undefined;
    filters.positiveElevation.from = undefined;
    filters.positiveElevation.to = undefined;
    filters.negativeElevation.from = undefined;
    filters.negativeElevation.to = undefined;
    filters.loopTypes.selected = undefined;
    filters.onlyVisibleOnMap = false;
    filters.tags.type = 'include_and';
    filters.tags.tagsUuids = [];
    this.state$.next({...this.state$.value, filters: {...filters}});
  }

  getDistanceFilterConfig(): NumericFilterConfig {
    switch (this.preferences.preferences.distanceUnit) {
      case 'METERS': return {
        min: 0,
        max: 50,
        step: 1,
        formatter: (value: number) => value + ' km'
      }
      case 'IMPERIAL': return {
        min: 0,
        max: 30,
        step: 1,
        formatter: (value: number) => value + ' mi'
      }
    }
  }

  getElevationFilterConfig(): NumericFilterConfig {
    switch (this.preferences.preferences.distanceUnit) {
      case 'METERS': return {
        min: 0,
        max: 2000,
        step: 50,
        formatter: (value: number) => value + ' m'
      }
      case 'IMPERIAL': return {
        min: 0,
        max: 6600,
        step: 150,
        formatter: (value: number) => value + ' ft'
      }
    }
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
    this.changeDetector.detectChanges();
  }

  private scrollTo(parent: HTMLElement, element: HTMLElement, trial: number): void {
    const scrollPos = parent.scrollTop;
    const totalHeight = parent.offsetHeight;
    const top = element.offsetTop - parent.offsetTop;
    const bottom = top + element.offsetHeight;
    if (top < scrollPos) {
      parent.scrollTo(0, top);
    } else if (bottom > scrollPos + totalHeight) {
      parent.scrollTo(0, bottom - totalHeight);
    } else {
      return;
    }
    if (trial >= 5) return;
    setTimeout(() => this.scrollTo(parent, element, trial + 1), 100);
  }

  import(): void {
    this.trailMenuService.importGpxDialog(this.collectionUuid!);
  }

  openTrail(trail: Trail): void {
    this.router.navigate(['trail', trail.owner, trail.uuid], {queryParams: { from: this.router.url }});
  }

  share(): void {
    this.trailMenuService.openSharePopup(this.collectionUuid!, []);
  }

  showMoreMenu(event: any): void {
    this.injector.get(PopoverController).create({
      component: MenuContentComponent,
      componentProps: {
        menu: this.moreMenu
      },
      event: event,
      side: 'bottom',
      dismissOnSelect: true,
      arrow: true,
    }).then(p => {
      p.present();
    });
  }

  removeFromList(trailWithInfo: TrailWithInfo): void {
    const index = this.allTrails.indexOf(trailWithInfo);
    if (index >= 0) {
      this.allTrails.splice(index, 1);
      this.applySort(this.applyFilters());
      if (this.highlighted === trailWithInfo.trail) {
        this.highlighted = undefined;
      }
      this.changeDetector.detectChanges();
    }
  }

}
