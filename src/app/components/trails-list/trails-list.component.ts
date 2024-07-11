import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Injector, Input, Output } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { CommonModule } from '@angular/common';
import { TrailOverviewComponent } from '../trail-overview/trail-overview.component';
import { IconLabelButtonComponent } from '../icon-label-button/icon-label-button.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { FileService } from 'src/app/services/file/file.service';
import { GpxFormat } from 'src/app/utils/formats/gpx-format';
import { AuthService } from 'src/app/services/auth/auth.service';
import { TrackService } from 'src/app/services/database/track.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { IonModal, IonHeader, IonTitle, IonContent, IonFooter, IonToolbar, IonButton, IonButtons, IonIcon, IonLabel, IonRadio, IonRadioGroup, IonItem, IonCheckbox, IonPopover, IonList } from "@ionic/angular/standalone";
import { BehaviorSubject, Observable, combineLatest, filter, map, of, switchMap } from 'rxjs';
import { ObjectUtils } from 'src/app/utils/object-utils';
import { ToggleChoiceComponent } from '../toggle-choice/toggle-choice.component';
import { Router } from '@angular/router';
import { TrackMetadataSnapshot } from 'src/app/services/database/track-database';
import { MenuContentComponent } from '../menu-content/menu-content.component';
import { FilterNumeric } from '../filters/filter';
import { FilterNumericComponent, NumericFilterValueEvent } from '../filters/filter-numeric/filter-numeric.component';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { TrackEditionService } from 'src/app/services/track-edition/track-edition.service';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { ProgressService } from 'src/app/services/progress/progress.service';

interface State {
  sortAsc: boolean;
  sortBy: string;
  filters: Filters;
}

interface Filters {
  duration: FilterNumeric;
  distance: FilterNumeric;
  positiveElevation: FilterNumeric;
  negativeElevation: FilterNumeric;
}

const defaultState: State = {
  sortAsc: false,
  sortBy: 'track.startDate',
  filters: {
    duration: {
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
  }
}

interface TrailWithInfo {
  trail: Trail;
  track: TrackMetadataSnapshot | null;
  selected: boolean;
}

@Component({
  selector: 'app-trails-list',
  templateUrl: './trails-list.component.html',
  styleUrls: ['./trails-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [IonList,
    IonPopover, IonCheckbox, IonItem, IonRadioGroup, IonRadio, IonLabel, IonIcon, IonButtons, IonButton,
    IonToolbar, IonFooter, IonContent, IonTitle, IonHeader, IonModal,
    CommonModule,
    TrailOverviewComponent,
    IconLabelButtonComponent,
    ToggleChoiceComponent,
    MenuContentComponent,
    FilterNumericComponent,
  ]
})
export class TrailsListComponent extends AbstractComponent {

  @Input() trails: Trail[] = [];
  @Input() collectionUuid?: string;

  @Input() metadataClass = 'two-columns';

  id = IdGenerator.generateId();
  highlighted?: Trail;

  @Output() trailClick = new EventEmitter<Trail>();

  state$ = new BehaviorSubject<State>(defaultState);

  allTrails: TrailWithInfo[] = [];
  shownTrails: TrailWithInfo[] = [];

  durationFormatter = (value: number) => this.i18n.hoursToString(value);
  distanceFormatter = (value: number) => this.i18n.distanceInUserUnitToString(value);
  elevationFormatter = (value: number) => this.i18n.elevationInUserUnitToString(value);
  isPositive = (value: any) => typeof value === 'number' && value > 0;

  constructor(
    injector: Injector,
    public i18n: I18nService,
    private fileService: FileService,
    private auth: AuthService,
    private trackService: TrackService,
    public trailService: TrailService,
    private changeDetector: ChangeDetectorRef,
    private router: Router,
    preferences: PreferencesService,
    private trackEdition: TrackEditionService,
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
  }

  protected override getComponentState() {
    return {
      trails: this.trails,
      collectionUuid: this.collectionUuid,
    }
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    if (newState?.collectionUuid !== previousState?.collectionUuid)
      this.state$.next(defaultState);

    this.byStateAndVisible.subscribe(
      this.trails.length === 0 ? of([]) : combineLatest(
        this.trails.map(
          trail => trail.currentTrackUuid$.pipe(
            switchMap(trackUuid => this.trackService.getMetadata$(trackUuid, trail.owner)),
            map(meta => ({trail, track: meta, selected: false}) as TrailWithInfo),
          )
        )
      ).pipe(
        debounceTimeExtended(0, 250, -1, (p, n) => p.length !== n.length)
      ),
      trailsWithInfo => {
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
    this.shownTrails = this.allTrails.filter(
      t => {
        if (filters.duration.from !== undefined && (t.track?.duration === undefined || t.track.duration < filters.duration.from * 60 * 60 * 1000)) return false;
        if (filters.duration.to !== undefined && (t.track?.duration === undefined || t.track.duration > filters.duration.to * 60 * 60 * 1000)) return false;
        if (minDistance !== undefined && (t.track?.distance === undefined || t.track.distance < minDistance)) return false;
        if (maxDistance !== undefined && (t.track?.distance === undefined || t.track.distance > maxDistance)) return false;
        if (minPosEle !== undefined && (t.track?.positiveElevation === undefined || t.track.positiveElevation < minPosEle)) return false;
        if (maxPosEle !== undefined && (t.track?.positiveElevation === undefined || t.track.positiveElevation > maxPosEle)) return false;
        if (minNegEle !== undefined && (t.track?.negativeElevation === undefined || t.track.negativeElevation < minNegEle)) return false;
        if (maxNegEle !== undefined && (t.track?.negativeElevation === undefined || t.track.negativeElevation > maxNegEle)) return false;
        return true;
      }
    );
  }

  private applySort(): void {
    this.shownTrails.sort((a,b) => this.compareTrails(a, b));
  }

  private compareTrails(a: TrailWithInfo, b: TrailWithInfo): number {
    const field = this.state$.value.sortBy;
    const diff = ObjectUtils.compare(
      ObjectUtils.extractField(a, field),
      ObjectUtils.extractField(b, field)
    )
    return this.state$.value.sortAsc ? diff : -diff;
  }

  public get nbShown(): number {
    return this.shownTrails.length
  }

  public get nbSelected(): number {
    return this.shownTrails.reduce((nb, trail) => nb + (trail.selected ? 1 : 0), 0);
  }

  selectAll(selected: boolean): void {
    this.shownTrails.forEach(t => t.selected = selected);
  }

  getSelectedTrails(): Trail[] {
    return this.shownTrails.filter(t => t.selected).map(t => t.trail);
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

  nbActiveFilters(): number {
    let nb = 0;
    const filters = this.state$.value.filters;
    if (filters.duration.from !== undefined || filters.duration.to !== undefined) nb++;
    if (filters.distance.from !== undefined || filters.distance.to !== undefined) nb++;
    if (filters.positiveElevation.from !== undefined || filters.positiveElevation.to !== undefined) nb++;
    if (filters.negativeElevation.from !== undefined || filters.negativeElevation.to !== undefined) nb++;
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
    this.fileService.openFileDialog({
      extension: '.gpx',
      mimeType: 'application/gpx+xml',
      multiple: true,
      description: this.i18n.texts.tools.import_gpx_description,
      onreading: () => new Promise((resolve, reject) => {
        resolve(null);
      }),
      onloaded: (files, fromReading) => {
        const progress = this.injector.get(ProgressService).create(this.i18n.texts.tools.importing, files.length);
        progress.subTitle = '0/' + files.length;
        const importNext = (index: number) => {
          const file = files[index];
          const imported = GpxFormat.importGpx(file, this.auth.email!, this.collectionUuid!);
          if (!imported) {
            // TODO show message
            progress.done();
            return;
          }
          if (imported.tracks.length === 1) {
            const improved = this.trackEdition.applyDefaultImprovments(imported.tracks[0]);
            imported.trail.currentTrackUuid = improved.uuid;
            imported.tracks.push(improved);
          }
          this.trackService.create(imported.tracks[0]);
          this.trackService.create(imported.tracks[imported.tracks.length - 1]);
          this.trailService.create(imported.trail);
          progress.subTitle = (index + 1) + '/' + files.length;
          progress.addWorkDone(1);
          if (index < files.length - 1) setTimeout(() => importNext(index + 1), 0);
        }
        setTimeout(() => importNext(0), 0);
      },
      onerror: (error, fromReading) => {
        console.log(error);
      }
    });
  }

  openTrail(trail: Trail): void {
    this.router.navigate(['/trail/' + trail.owner + '/' + trail.uuid], {queryParams: { from: this.router.url }});
  }

}
