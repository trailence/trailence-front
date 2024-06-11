import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Injector, Input, Output } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { CommonModule } from '@angular/common';
import { TrailOverviewComponent } from '../trail-overview/trail-overview.component';
import { IconLabelButtonComponent } from '../icon-label-button/icon-label-button.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { FileService } from 'src/app/services/file/file.service';
import { GpxImporter } from 'src/app/utils/formats/gpx-format';
import { AuthService } from 'src/app/services/auth/auth.service';
import { TrackService } from 'src/app/services/database/track.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { IonModal, IonHeader, IonTitle, IonContent, IonFooter, IonToolbar, IonButton, IonButtons, IonIcon, IonLabel, IonRadio, IonRadioGroup, IonList, IonItem, IonCheckbox, IonPopover } from "@ionic/angular/standalone";
import { BehaviorSubject, Observable, combineLatest, map, mergeMap, of } from 'rxjs';
import { ObjectUtils } from 'src/app/utils/object-utils';
import { ToggleChoiceComponent } from '../toggle-choice/toggle-choice.component';
import { TagService } from 'src/app/services/database/tag.service';
import { Router } from '@angular/router';
import { debounceTimeExtended } from 'src/app/utils/rxjs/rxjs-utils';
import { TrackMetadataSnapshot } from 'src/app/services/database/track-database';
import { MenuContentComponent } from '../menu-content/menu-content.component';

interface State {
  sortAsc: boolean;
  sortBy: string;
  filters: Filters;
}

interface Filters {

}

const defaultState: State = {
  sortAsc: false,
  sortBy: 'track.startDate',
  filters: {}
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
  imports: [IonPopover, IonCheckbox, IonItem, IonList, IonRadioGroup, IonRadio, IonLabel, IonIcon, IonButtons, IonButton, IonToolbar, IonFooter, IonContent, IonTitle, IonHeader, IonModal,
    CommonModule,
    TrailOverviewComponent,
    IconLabelButtonComponent,
    ToggleChoiceComponent,
    MenuContentComponent,
  ]
})
export class TrailsListComponent extends AbstractComponent {

  @Input() trails$?: Observable<Observable<Trail | null>[]>;
  @Input() collectionUuid?: string;

  @Input() metadataClass = 'two-columns';

  id = IdGenerator.generateId();
  highlighted?: Trail;

  @Output() trailClick = new EventEmitter<Trail>();

  state$ = new BehaviorSubject<State>(defaultState);

  allTrails: TrailWithInfo[] = [];
  shownTrails: TrailWithInfo[] = [];

  constructor(
    injector: Injector,
    public i18n: I18nService,
    private fileService: FileService,
    private auth: AuthService,
    private trackService: TrackService,
    public trailService: TrailService,
    private tagService: TagService,
    private changeDetector: ChangeDetectorRef,
    private router: Router,
  ) {
    super(injector);
  }

  protected override getComponentState() {
    return {
      trails$: this.trails$,
      collectionUuid: this.collectionUuid,
    }
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.allTrails = [];
    this.shownTrails = [];
    this.changeDetector.markForCheck();
    if (!this.trails$) {
      return;
    }
    this.state$.next(defaultState);
    this.byStateAndVisible.subscribe(
      this.trails$.pipe(
        mergeMap(list => list.length > 0 ? combineLatest(list) : of([])),
        map(trails => trails.filter(trail => !!trail) as Trail[]),
        mergeMap(trails => trails.length === 0 ? of([]) :
          combineLatest(trails.map(trail => trail.currentTrackUuid$)).pipe(
            mergeMap(uuids => combineLatest(uuids.map((uuid, index) => this.trackService.getMetadata$(uuid, trails[index].owner)))),
            map(tracks => tracks.map((track, index) => ({trail: trails[index], track: track, selected: false})))
          )
        ),
        debounceTimeExtended(0, 250, -1, (p, n) => p.length !== n.length)
      ),
      result => {
        this.allTrails = result;
        this.applyFilters();
        this.applySort();
        this.changeDetector.markForCheck();
      }
    );
    let previous = defaultState;
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
          this.changeDetector.markForCheck();
        }
        previous = state;
      }
    );
  }

  private applyFilters(): void {
    // TODO
    this.shownTrails = [...this.allTrails];
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
        files.forEach(file => {
          const imported = GpxImporter.importGpx(file, this.auth.email!, this.collectionUuid!);
          this.trackService.create(imported.track);
          this.trailService.create(imported.trail);
        });
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
