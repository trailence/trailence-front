import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Injector, Input, Output } from '@angular/core';
import { Trail, TrailLoopType } from 'src/app/model/trail';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { CommonModule } from '@angular/common';
import { TrailOverviewComponent } from '../trail-overview/trail-overview.component';
import { IconLabelButtonComponent } from '../icon-label-button/icon-label-button.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrackService } from 'src/app/services/database/track.service';
import { IonModal, IonHeader, IonTitle, IonContent, IonFooter, IonToolbar, IonButton, IonButtons, IonIcon, IonLabel, IonRadio, IonRadioGroup, IonItem, IonCheckbox, IonPopover, IonList, IonSelectOption, IonSelect } from "@ionic/angular/standalone";
import { BehaviorSubject, combineLatest, map, of, skip, switchMap } from 'rxjs';
import { ObjectUtils } from 'src/app/utils/object-utils';
import { ToggleChoiceComponent } from '../toggle-choice/toggle-choice.component';
import { Router } from '@angular/router';
import { TrackMetadataSnapshot } from 'src/app/services/database/track-database';
import { MenuContentComponent } from '../menu-content/menu-content.component';
import { FilterEnum, FilterNumeric, FilterTags } from '../filters/filter';
import { FilterNumericComponent, NumericFilterValueEvent } from '../filters/filter-numeric/filter-numeric.component';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { MapComponent } from '../map/map.component';
import { TrailMenuService } from 'src/app/services/database/trail-menu.service';
import { TagService } from 'src/app/services/database/tag.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { TrailTag } from 'src/app/model/trail-tag';
import { FilterTagsComponent } from '../filters/filter-tags/filter-tags.component';

const LOCALSTORAGE_KEY_LISTSTATE = 'trailence.list-state.';

interface State {
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
      exclude: false,
      onlyWithoutAnyTag: false,
      onlyWithAnyTag: false,
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
  standalone: true,
  imports: [IonList, IonSelect, IonSelectOption,
    IonPopover, IonCheckbox, IonItem, IonRadioGroup, IonRadio, IonLabel, IonIcon, IonButtons, IonButton,
    IonToolbar, IonFooter, IonContent, IonTitle, IonHeader, IonModal,
    CommonModule,
    TrailOverviewComponent,
    IconLabelButtonComponent,
    ToggleChoiceComponent,
    MenuContentComponent,
    FilterNumericComponent,
    FilterTagsComponent,
  ]
})
export class TrailsListComponent extends AbstractComponent {

  @Input() trails: Trail[] = [];
  @Input() collectionUuid?: string;

  @Input() metadataClass = 'two-columns';

  @Input() map?: MapComponent;
  @Input() listId!: string;

  id = IdGenerator.generateId();
  highlighted?: Trail;

  @Output() trailClick = new EventEmitter<Trail>();
  @Output() mapFilteredTrails = new EventEmitter<{trail: Trail, track: TrackMetadataSnapshot | null}[]>();

  state$ = new BehaviorSubject<State>(defaultState);

  allTrails: TrailWithInfo[] = [];
  mapTrails: TrailWithInfo[] = [];
  listTrails: TrailWithInfo[] = [];

  durationFormatter = (value: number) => this.i18n.hoursToString(value);
  distanceFormatter = (value: number) => this.i18n.distanceInUserUnitToString(value);
  elevationFormatter = (value: number) => this.i18n.elevationInUserUnitToString(value);
  isPositive = (value: any) => typeof value === 'number' && value > 0;

  loopTypes = Object.values(TrailLoopType);

  constructor(
    injector: Injector,
    public i18n: I18nService,
    private trackService: TrackService,
    public trailMenuService: TrailMenuService,
    private changeDetector: ChangeDetectorRef,
    private router: Router,
    preferences: PreferencesService,
    private tagService: TagService,
    private authService:AuthService,
  ) {
    super(injector);
    let currentDistanceUnit = preferences.preferences.distanceUnit;
    let currentElevationUnit = preferences.preferences.elevationUnit;
    this.whenVisible.subscribe(preferences.preferences$,
      prefs => {
        let changed = false;
        if (currentDistanceUnit !== prefs.distanceUnit) {
          currentDistanceUnit = prefs.distanceUnit;
          this.state$.value.filters.distance = { from: undefined, to: undefined };
          changed = true;
        }
        if (currentElevationUnit !== prefs.elevationUnit) {
          currentElevationUnit = prefs.elevationUnit;
          this.state$.value.filters.positiveElevation = { from: undefined, to: undefined };
          this.state$.value.filters.negativeElevation = { from: undefined, to: undefined };
        }
        if (changed)
          this.state$.next({...this.state$.value, filters: {...this.state$.value.filters}});
      }
    );
    this.state$.pipe(
      skip(1)
    ).subscribe(() => this.saveState());
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

    this.byStateAndVisible.subscribe(
      combineLatest([
        this.map ? combineLatest([this.map.getState().center$, this.map.getState().zoom$]) : of([undefined, undefined]),
        this.trails.length === 0 ? of([]) : combineLatest(
          this.trails.map(
            trail => combineLatest([
              trail.currentTrackUuid$.pipe(switchMap(trackUuid => this.trackService.getMetadata$(trackUuid, trail.owner))),
              trail.owner === this.authService.email ? this.tagService.getTrailTags$(trail.uuid) : of([])
            ]).pipe(
              map(([track, tags]) => ({
                trail,
                track,
                tags,
                selected: false,
              }) as TrailWithInfo)
            )
          )
        )
      ]).pipe(
        debounceTimeExtended(0, 250, -1, (p, n) => p[1].length !== n[1].length)
      ),
      ([mapState, trailsWithInfo]) => {
        for (const t of trailsWithInfo) {
          const current = this.allTrails.find(c => c.trail.uuid === t.trail.uuid && c.trail.owner === t.trail.owner);
          if (current?.selected) t.selected = true;
        }
        this.allTrails = trailsWithInfo;
        this.applyFilters();
        this.applySort();
        this.changeDetector.detectChanges();
      }
    );

    let previous = this.state$.value;
    this.byStateAndVisible.subscribe(
      this.state$,
      state => {
        if (state === previous) return;
        if (state.filters !== previous.filters) {
          this.applyFilters();
          this.applySort();
          this.changeDetector.markForCheck();
        } else if (state.sortAsc !== previous.sortAsc || state.sortBy !== previous.sortBy) {
          this.applySort();
          this.changeDetector.detectChanges();
        }
        previous = state;
      }
    );
  }

  private applyFilters(): void {
    const filters = this.state$.value.filters;
    const minDistance = filters.distance.from === undefined ? undefined : this.i18n.distanceInMetersFromUserUnit(filters.distance.from);
    const maxDistance = filters.distance.to === undefined ? undefined : this.i18n.distanceInMetersFromUserUnit(filters.distance.to);
    const minPosEle = filters.positiveElevation.from === undefined ? undefined : this.i18n.elevationInMetersFromUserUnit(filters.positiveElevation.from);
    const maxPosEle = filters.positiveElevation.to === undefined ? undefined : this.i18n.elevationInMetersFromUserUnit(filters.positiveElevation.to);
    const minNegEle = filters.negativeElevation.from === undefined ? undefined : this.i18n.elevationInMetersFromUserUnit(filters.negativeElevation.from);
    const maxNegEle = filters.negativeElevation.to === undefined ? undefined : this.i18n.elevationInMetersFromUserUnit(filters.negativeElevation.to);
    this.mapTrails = this.allTrails.filter(
      t => {
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
        if (filters.tags.onlyWithAnyTag) {
          if (t.tags.length === 0) return false;
        } else if (filters.tags.onlyWithoutAnyTag) {
          if (t.tags.length !== 0) return false;
        } else if (filters.tags.tagsUuids.length > 0) {
          const uuids = t.tags.map(tag => tag.tagUuid);
          if (filters.tags.exclude) {
            if (uuids.some(uuid => filters.tags.tagsUuids.indexOf(uuid) >= 0)) return false;
          } else {
            if (!uuids.some(uuid => filters.tags.tagsUuids.indexOf(uuid) >= 0)) return false;
          }
        }
        return true;
      }
    );
    const mapBounds = this.map?.getBounds();
    if (filters.onlyVisibleOnMap && mapBounds) {
      this.listTrails = this.mapTrails.filter(t => {
        const b = t.track?.bounds;
        return !b || mapBounds.overlaps(b);
      });
    } else {
      this.listTrails = this.mapTrails;
    }
    this.mapFilteredTrails.emit(this.mapTrails.map(t => ({trail: t.trail, track: t.track})));
  }

  private applySort(): void {
    this.listTrails.sort((a,b) => this.compareTrails(a, b));
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

  public get nbShown(): number {
    return this.listTrails.length
  }

  public get nbSelected(): number {
    return this.listTrails.reduce((nb, trail) => nb + (trail.selected ? 1 : 0), 0);
  }

  selectAll(selected: boolean): void {
    this.listTrails.forEach(t => t.selected = selected);
  }

  getSelectedTrails(): Trail[] {
    return this.listTrails.filter(t => t.selected).map(t => t.trail);
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
    if (filters.tags.onlyWithAnyTag || filters.tags.onlyWithoutAnyTag || filters.tags.tagsUuids.length !== 0) nb++;
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
    filters.tags.onlyWithAnyTag = false;
    filters.tags.onlyWithoutAnyTag = false;
    filters.tags.exclude = false;
    filters.tags.tagsUuids = [];
    this.state$.next({...this.state$.value, filters: {...filters}});
  }

  onTrailClick(trail: Trail): void {
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
          const scrollPos = parent.scrollTop;
          const totalHeight = parent.offsetHeight;
          const top = element.offsetTop - parent.offsetTop;
          const bottom = top + element.offsetHeight;
          if (top < scrollPos) {
            parent.scrollTo(0, top);
          } else if (bottom > scrollPos + totalHeight) {
            parent.scrollTo(0, bottom - totalHeight);
          }
        }
      }
    }
    this.changeDetector.markForCheck();
  }

  import(): void {
    this.trailMenuService.importGpxDialog(this.collectionUuid!);
  }

  openTrail(trail: Trail): void {
    this.router.navigate(['/trail/' + trail.owner + '/' + trail.uuid], {queryParams: { from: this.router.url }});
  }

  share(): void {
    this.trailMenuService.openSharePopup(this.collectionUuid!, []);
  }

}
