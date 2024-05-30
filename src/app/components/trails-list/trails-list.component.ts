import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { CommonModule } from '@angular/common';
import { TrailOverviewComponent } from '../trail-overview/trail-overview.component';
import { TrackMetadataDisplayMode } from '../track-metadata/track-metadata.component';
import { IconLabelButtonComponent } from '../icon-label-button/icon-label-button.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { FileService } from 'src/app/services/file/file.service';
import { GpxImporter } from 'src/app/utils/formats/gpx-format';
import { AuthService } from 'src/app/services/auth/auth.service';
import { TrackService } from 'src/app/services/database/track.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { IonModal, IonHeader, IonTitle, IonContent, IonFooter, IonToolbar, IonButton, IonButtons, IonIcon, IonLabel, IonRadio, IonRadioGroup, IonList, IonItem, IonCheckbox } from "@ionic/angular/standalone";
import { BehaviorSubject, Observable, combineLatest, map, mergeMap, of } from 'rxjs';
import { ObjectUtils } from 'src/app/utils/object-utils';
import { ToggleChoiceComponent } from '../toggle-choice/toggle-choice.component';

interface State {
  sortAsc: boolean;
  sortBy: string;
  filters: Filters;
}

interface Filters {

}

const defaultState: State = {
  sortAsc: false,
  sortBy: 'track.metadata.startDate',
  filters: {}
}

interface TrailWithInfo {
  trail: Trail;
  selected: boolean;
}

@Component({
  selector: 'app-trails-list',
  templateUrl: './trails-list.component.html',
  styleUrls: ['./trails-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [IonCheckbox, IonItem, IonList, IonRadioGroup, IonRadio, IonLabel, IonIcon, IonButtons, IonButton, IonToolbar, IonFooter, IonContent, IonTitle, IonHeader, IonModal, 
    CommonModule,
    TrailOverviewComponent,
    IconLabelButtonComponent,
    ToggleChoiceComponent,
  ]
})
export class TrailsListComponent extends AbstractComponent {

  @Input() trails$?: Observable<Observable<Trail | null>[]>;
  @Input() collectionUuid?: string;

  @Input() mode: TrackMetadataDisplayMode = 'TWO_COLUMNS';

  state$ = new BehaviorSubject<State>(defaultState);

  allTrails: TrailWithInfo[] = [];
  shownTrails: TrailWithInfo[] = [];

  constructor(
    injector: Injector,
    public i18n: I18nService,
    private fileService: FileService,
    private auth: AuthService,
    private trackService: TrackService,
    private trailService: TrailService,
    private changeDetector: ChangeDetectorRef,
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
        map(trails => trails.filter(trail => !!trail) as Trail[])
      ),
      result => {
        this.allTrails = result.map(trail => ({trail, selected: false}));
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
    this.shownTrails.sort((a,b) => this.compareTrails(a.trail, b.trail));
  }

  private compareTrails(a: Trail, b: Trail): number {
    const field = this.state$.value.sortBy;
    const objectA = {
      trail: a,
      track: this.trackService.getTrack(a.currentTrackUuid, a.owner)
    };
    const objectB = {
      trail: b,
      track: this.trackService.getTrack(b.currentTrackUuid, b.owner)
    };
    const diff = ObjectUtils.compare(
      ObjectUtils.extractField(objectA, field),
      ObjectUtils.extractField(objectB, field)
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

  sortBy(name: string): void {
    if (this.state$.value.sortBy === name) return;
    this.state$.next({...this.state$.value, sortBy: name});
  }

  sortAsc(asc: boolean): void {
    if (this.state$.value.sortAsc === asc) return;
    this.state$.next({...this.state$.value, sortAsc: asc});
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

}
