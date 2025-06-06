import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Injector, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ToastController, AlertController } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrackEditTool, TrackEditToolContext } from './tools/tool.interface';
import { RemoveUnprobableElevation } from './tools/elevation/remove-unprobable-elevation';
import { MenuItem } from 'src/app/components/menus/menu-item';
import { BehaviorSubject, debounceTime, defaultIfEmpty, first, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { Track } from 'src/app/model/track';
import { AuthService } from 'src/app/services/auth/auth.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { SlopeThreshold } from './tools/elevation/slope-threshold/slope-threshold';
import { TrackEditToolsStack } from './tools/track-edit-tools-stack';
import { SelectionComponent } from './tools/selection/selection.component';
import { RemoveSelectionTool } from './tools/selection/remove-selection';
import { RemoveBeforeSelectedPointTool } from './tools/selection/remove-before-selected-point';
import { RemoveAfterSelectedPointTool } from './tools/selection/remove-after-selected-point';
import { CreateWayPointTool } from './tools/way-points/create-way-point';
import { RemoveWayPointTool } from './tools/way-points/remove-way-point';
import { CloseSelectionTool } from './tools/selection/close-selection';
import { ReplaceElevationWithProvider } from './tools/elevation/replace-with-provider';
import { ImproveElevationWithProvider } from './tools/elevation/improve-with-provider';
import { JoinArrivalToDeparture } from './tools/path/join-arrival-to-departure';
import { JoinDepartureToArrival } from './tools/path/join-departure-to-arrival';
import { Trail } from 'src/app/model/trail';
import { BackToOriginalTrack } from './tools/track/back-to-original';
import { ToogleShowOnlyModifiedTrack } from './tools/track/toggle-show-only-modified-track';
import { TrailSelection } from '../trail/trail-selection';
import { EditWayPointTool } from './tools/way-points/edit-way-point';
import { PointReference, RangeReference } from 'src/app/model/point-reference';
import { TrackService } from 'src/app/services/database/track.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { TrackEditionService } from 'src/app/services/track-edition/track-edition.service';
import { ProgressService } from 'src/app/services/progress/progress.service';
import { RemoveUnprobablePointsTool } from './tools/path/remove-unprobable-points';
import { RemoveBreaksMovesTool } from './tools/path/remove-breaks-moves';
import { SetElevationOnRangeManuallyTool, SetElevationOnRangeSmoothTool, SetElevationOnRangeWithEndTool, SetElevationOnRangeWithStartTool } from './tools/elevation/set-elevation';
import { ApplyDefaultImprovementsTool } from './tools/track/apply-default-improvements';
import { MergeSegementsTool } from './tools/path/merge-segments';
import { ToolbarComponent } from '../menus/toolbar/toolbar.component';

interface TrackEditToolsState {
  baseTrack?: Track;
  modifiedTrack?: Track;
  selection?: PointReference[] | RangeReference[];
}

@Component({
  selector: 'app-track-edit-tools',
  templateUrl: './track-edit-tools.component.html',
  styleUrl: './track-edit-tools.component.scss',
  imports: [
    CommonModule,
    ToolbarComponent,
  ]
})
export class TrackEditToolsComponent implements OnInit, OnDestroy {

  @Input() trail!: Trail;
  @Input() selection!: TrailSelection;
  @Input() originalTrack$!: BehaviorSubject<Track | undefined>;
  @Input() modifiedTrack$!: BehaviorSubject<Track | undefined>;
  @Input() baseTrack$!: BehaviorSubject<Track | undefined>;
  @Input() hideBaseTrack$!: BehaviorSubject<boolean>;

  @Output() toolsStackChange = new EventEmitter<TrackEditToolsStack | undefined>();
  @Output() onClose = new EventEmitter<boolean>();

  private toMenuItem(tool: TrackEditTool): MenuItem {
    return new MenuItem()
      .setIcon(tool.icon)
      .setI18nLabel(() => 'track_edit_tools.tools.' + tool.labelKey(this.context))
      .setBackgroundColor(tool.backgroundColor)
      .setTextColor(tool.textColor)
      .setAction(() => {
        tool.execute(this.context);
      })
      .setVisible(() => tool.isAvailable(this.context))
      ;
  }
  toolsItems: MenuItem[] = [
    new MenuItem().setIcon('selection').setI18nLabel('track_edit_tools.categories.selection')
      .setChildren([
        new MenuItem().setIcon('selection').setI18nLabel('track_edit_tools.categories.selection').setTextColor('secondary'),
        this.toMenuItem(new CloseSelectionTool()),
        new MenuItem(),
        this.toMenuItem(new RemoveSelectionTool()),
        this.toMenuItem(new RemoveBeforeSelectedPointTool()),
        this.toMenuItem(new RemoveAfterSelectedPointTool()),
      ]),
    new MenuItem().setIcon('distance').setI18nLabel('track_edit_tools.categories.track')
      .setChildren([
        new MenuItem().setIcon('distance').setI18nLabel('track_edit_tools.categories.track').setTextColor('secondary'),
        this.toMenuItem(new BackToOriginalTrack()),
        this.toMenuItem(new ToogleShowOnlyModifiedTrack()),
        this.toMenuItem(new ApplyDefaultImprovementsTool()),
      ]),
    new MenuItem().setIcon('location').setI18nLabel('track_edit_tools.categories.way_point')
      .setChildren([
        new MenuItem().setIcon('location').setI18nLabel('track_edit_tools.categories.way_point').setTextColor('secondary'),
        this.toMenuItem(new CreateWayPointTool()),
        this.toMenuItem(new EditWayPointTool()),
        this.toMenuItem(new RemoveWayPointTool()),
      ]),
    new MenuItem().setIcon('elevation').setI18nLabel('track_edit_tools.categories.elevation')
      .setChildren([
        new MenuItem().setIcon('elevation').setI18nLabel('track_edit_tools.categories.elevation').setTextColor('secondary'),
        new MenuItem().setI18nLabel('track_edit_tools.categories.set_elevation_on_range').setTextColor('secondary').setSectionTitle(true),
        this.toMenuItem(new SetElevationOnRangeWithStartTool()),
        this.toMenuItem(new SetElevationOnRangeWithEndTool()),
        this.toMenuItem(new SetElevationOnRangeSmoothTool()),
        this.toMenuItem(new SetElevationOnRangeManuallyTool()),
        new MenuItem().setI18nLabel('track_edit_tools.categories.improvements').setTextColor('secondary').setSectionTitle(true),
        this.toMenuItem(new RemoveUnprobableElevation()),
        this.toMenuItem(new SlopeThreshold()),
        new MenuItem().setI18nLabel('track_edit_tools.categories.elevation_provider').setTextColor('secondary').setSectionTitle(true),
        this.toMenuItem(new ImproveElevationWithProvider()),
        this.toMenuItem(new ReplaceElevationWithProvider()),
      ]),
    new MenuItem().setIcon('path').setI18nLabel('track_edit_tools.categories.path')
      .setChildren([
        new MenuItem().setIcon('path').setI18nLabel('track_edit_tools.categories.path').setTextColor('secondary'),
        this.toMenuItem(new MergeSegementsTool()),
        new MenuItem().setI18nLabel('track_edit_tools.categories.join_departure_and_arrival').setTextColor('secondary').setSectionTitle(true),
        this.toMenuItem(new JoinArrivalToDeparture()),
        this.toMenuItem(new JoinDepartureToArrival()),
        new MenuItem().setI18nLabel('track_edit_tools.categories.improvements').setTextColor('secondary').setSectionTitle(true),
        this.toMenuItem(new RemoveUnprobablePointsTool()),
        this.toMenuItem(new RemoveBreaksMovesTool()),
      ]),
    new MenuItem(),
    new MenuItem().setIcon('undo').setI18nLabel('buttons.undo').setDisabled(() => this.statesStack.length === 0).setAction(() => this.undo()),
    new MenuItem().setIcon('redo').setI18nLabel('buttons.redo').setDisabled(() => this.undoneStack.length === 0).setAction(() => this.redo()),
    new MenuItem(),
    new MenuItem().setIcon('save').setI18nLabel('buttons.save').setDisabled(() => !this.canSave()).setTextColor('success').setAction(() => this.save()),
    new MenuItem(),
    new MenuItem().setIcon('cross').setI18nLabel('buttons.close').setAction(() => this.close()),
  ];
  @ViewChild('toolbar') toolbar?: ToolbarComponent;

  context!: TrackEditToolContext;
  readonly statesStack: TrackEditToolsState[] = [];
  readonly undoneStack: TrackEditToolsState[] = [];

  private toolsStack?: TrackEditToolsStack;
  private selectionSubscription?: Subscription;

  constructor(
    public readonly i18n: I18nService,
    private readonly auth: AuthService,
    private readonly toastController: ToastController,
    private readonly changesDetector: ChangeDetectorRef,
    private readonly injector: Injector,
  ) {
  }

  ngOnInit(): void {
    this.context = {
      injector: this.injector,
      selection: this.selection,
      trail: this.trail,
      currentTrack$: new BehaviorSubject<Track | undefined>(undefined),

      modifyTrack: (mayNotChange, trackModifier) => this.modify(mayNotChange, trackModifier),
      modifySelectedRange: (mayNotChange, trackModifier) => this.modifySelectedRange(mayNotChange, trackModifier),
      setBaseTrack: (track) => {
        this.selection.cancelSelection();
        this.pushHistory();
        this.baseTrack$.next(track);
        this.modifiedTrack$.next(undefined);
        this.currentTrackChanged();
      },
      isBaseTrackShown: () => !this.hideBaseTrack$.value,
      setShowBaseTrack: (show) => {
        this.hideBaseTrack$.next(!show);
        this.refreshTools();
      },
      hasModifications: () => this.modifiedTrack$.value !== undefined,

      appendTool: (component) => {
        if (!this.toolsStack) {
          this.toolsStack = new TrackEditToolsStack(this.context, [component]);
        } else {
          const existing = this.toolsStack.components.find(c => c.component === component.component);
          if (existing) {
            component.onCreated(existing.instance);
            return;
          }
          this.toolsStack.components.push(component);
        }
        this.toolsStackChange.emit(this.toolsStack);
        this.refreshTools();
      },
      insertTool: (component) => {
        if (!this.toolsStack) {
          this.toolsStack = new TrackEditToolsStack(this.context, [component]);
        } else {
          const index = this.toolsStack.components.findIndex(c => c.component === component.component);
          if (index < 0)
            this.toolsStack.components.splice(0, 0, component);
          else {
            const existing = this.toolsStack.components[index];
            if (index > 0) {
              this.toolsStack.components.splice(index, 1);
              this.toolsStack.components.splice(0, 0, component);
            }
            component.onCreated(existing.instance);
            if (index === 0) return;
          }
        }
        this.toolsStackChange.emit(this.toolsStack);
        this.refreshTools();
      },
      removeTool: (component) => {
        if (!this.toolsStack) return;
        const index = this.toolsStack.components.findIndex(c => c.component === component);
        if (index < 0) return;
        this.toolsStack.components.splice(index, 1);
        if (this.toolsStack.components.length === 0) this.toolsStack = undefined;
        this.toolsStackChange.emit(this.toolsStack);
        this.refreshTools();
      },
      getTool: (component) => {
        return this.toolsStack?.components.find(c => c.component === component)?.instance;
      },
      refreshTools: () => this.refreshTools(),
    };
    this.currentTrackChanged();
    this.selectionSubscription = this.selection.selection$.pipe(debounceTime(1)).subscribe(sel => {
      if (!sel || sel.length === 0) this.context.removeTool(SelectionComponent);
      else this.context.insertTool({component: SelectionComponent, onCreated: () => {}});
      this.refreshTools();
    });
  }

  ngOnDestroy(): void {
    this.selectionSubscription?.unsubscribe();
    this.selection.cancelSelection();
    this.toolsStackChange.emit(undefined);
    this.modifiedTrack$.next(undefined);
    this.baseTrack$.next(undefined);
    this.hideBaseTrack$.next(false);
  }

  refreshTools(): void {
    this.toolbar?.refresh();
    this.changesDetector.detectChanges();
  }

  undo(): void {
    if (this.statesStack.length === 0) return;
    const state = this.statesStack.splice(this.statesStack.length - 1, 1)[0];
    this.undoneStack.push(this.getCurrentState());
    if (this.undoneStack.length > 50) this.undoneStack.splice(0, 1);
    this.setState(state);
  }

  redo(): void {
    if (this.undoneStack.length === 0) return;
    const state = this.undoneStack.splice(this.undoneStack.length - 1, 1)[0];
    this.pushHistory();
    this.setState(state);
  }

  private getCurrentState(): TrackEditToolsState {
    return {
      baseTrack: this.baseTrack$.value,
      modifiedTrack: this.modifiedTrack$.value,
      selection: this.selection.selection$.value,
    };
  }

  private pushHistory(): void {
    this.statesStack.push(this.getCurrentState());
    if (this.statesStack.length > 50) this.statesStack.splice(0, 1);
  }

  private setState(state: TrackEditToolsState): void {
    const previousState = this.getCurrentState();
    this.baseTrack$.next(state.baseTrack);
    this.modifiedTrack$.next(state.modifiedTrack);
    if (previousState.modifiedTrack) {
      if (state.modifiedTrack !== previousState.modifiedTrack)
        this.currentTrackChanged();
    } else if (state.modifiedTrack) {
      this.currentTrackChanged();
    } else if (previousState.baseTrack) {
      if (state.baseTrack !== previousState.baseTrack)
        this.currentTrackChanged();
    } else if (state.baseTrack) {
      this.currentTrackChanged();
    }
    if (state.selection && state.selection.length > 0) {
      if (state.selection[0] instanceof PointReference) {
        this.selection.selectPoint(state.selection as PointReference[]);
      } else {
        this.selection.selectRange(state.selection as RangeReference[]);
      }
    } else {
      this.selection.cancelSelection();
    }
  }

  private getCurrentTrack(): Observable<Track> {
    if (this.modifiedTrack$.value)
      return of(this.modifiedTrack$.value);
    if (this.baseTrack$.value)
      return of(this.baseTrack$.value);
    return this.originalTrack$.pipe(filterDefined(), first());
  }

  private currentTrackChanged(): void {
    if (this.modifiedTrack$.value)
      this.context.currentTrack$.next(this.modifiedTrack$.value)
    else if (this.baseTrack$.value)
      this.context.currentTrack$.next(this.baseTrack$.value);
    else
      this.originalTrack$.pipe(first()).subscribe(newTrack => this.context.currentTrack$.next(newTrack));
    this.refreshTools();
  }

  private trackModified(newTrack: Track) {
    this.pushHistory();
    this.undoneStack.splice(0, this.undoneStack.length);
    this.modifiedTrack$.next(newTrack);
    this.currentTrackChanged();
  }

  public modify<T>(mayNotChange: boolean, modification: (track: Track) => Observable<T>): Observable<T | undefined> {
    return this.getCurrentTrack().pipe(
      switchMap(originalTrack => {
        const copy = originalTrack.copy(this.auth.email!);
        const before = mayNotChange ? copy.copy(this.auth.email!) : undefined;
        const originalSelection = this.selection.getSelectionForTrack(originalTrack);
        const copySelectionStart =
          originalSelection instanceof PointReference ?
            copy.segments[originalSelection.segmentIndex].points[originalSelection.pointIndex] :
            (originalSelection ?
              copy.segments[originalSelection.start.segmentIndex].points[originalSelection.start.pointIndex] :
              undefined);
        const copySelectionEnd =
          originalSelection instanceof RangeReference ?
          copy.segments[originalSelection.end.segmentIndex].points[originalSelection.end.pointIndex] :
          undefined;
        return modification(copy).pipe(
          defaultIfEmpty(undefined),
          map(result => {
            if (mayNotChange && copy.isEquals(before!)) {
              this.toastController.create({
                message: this.i18n.texts.track_edit_tools.no_modification,
                duration: 2000,
              })
              .then(toast => toast.present());
            } else {
              this.selection.removeSelectionForTrack(originalTrack);
              if (!copySelectionStart) {
                this.selection.cancelSelection();
              } else {
                const newSelectionStart = copy.findPointInstance(copySelectionStart);
                if (!newSelectionStart) {
                  this.selection.cancelSelection();
                } else {
                  const newSelectionEnd = copySelectionEnd ? copy.findPointInstance(copySelectionEnd) : undefined;
                  if (newSelectionEnd) this.selection.addRange(new RangeReference(newSelectionStart, newSelectionEnd));
                  else this.selection.addPoint(newSelectionStart);
                }
              }
              this.trackModified(copy);
            }
            return result;
          })
        );
      })
    );
  }

  public modifySelectedRange<T>(mayNotChange: boolean, modification: (track: Track) => Observable<T>): Observable<T | undefined> {
    return this.getCurrentTrack().pipe(
      switchMap(fullTrack => {
        const sel = this.selection.getSubTrackOf(fullTrack);
        if (!sel) return this.modify(mayNotChange, modification);
        const subTrack = sel.subTrack;
        const range = sel.range;
        const before = mayNotChange ? subTrack.copy(this.auth.email!) : undefined;
        return modification(subTrack).pipe(
          defaultIfEmpty(undefined),
          map(result => {
            if (mayNotChange && subTrack.isEquals(before!)) {
              this.toastController.create({
                message: this.i18n.texts.track_edit_tools.no_modification,
                duration: 2000,
              })
              .then(toast => toast.present());
            } else {
              this.selection.removeSelectionForTrack(fullTrack);
              const newTrack = fullTrack.copy(this.auth.email!)
              const newSelectionStart = new PointReference(newTrack, range.start.segmentIndex, range.start.pointIndex);
              const newSelectionEnd = newTrack.replace(range.start.segmentIndex, range.start.pointIndex, range.end.segmentIndex, range.end.pointIndex, subTrack);
              if (!newSelectionEnd) {
                this.selection.cancelSelection();
              } else if (newSelectionEnd.segmentIndex === newSelectionStart.segmentIndex && newSelectionEnd.pointIndex === newSelectionStart.pointIndex) {
                this.selection.reduceRangeToStartPoint();
                this.selection.addPoint(newSelectionStart);
              } else {
                this.selection.addRange(new RangeReference(newSelectionStart, newSelectionEnd));
              }
              this.trackModified(newTrack);
            }
            return result;
          })
        );
      }),
    );
  }

  public saving = false;

  canSave(): boolean {
    return !this.saving && (!!this.baseTrack$.value || !!this.modifiedTrack$.value);
  }

  public save(): void {
    if (this.saving || (this.baseTrack$.value === undefined && this.modifiedTrack$.value === undefined)) return;
    this.saving = true;
    const progress = this.injector.get(ProgressService).create(this.i18n.texts.trace_recorder.saving, 3);
    this.changesDetector.detectChanges();
    setTimeout(() => {
      let track = (this.modifiedTrack$.value ?? this.baseTrack$.value)!;
      track = track.copy(this.auth.email!);
      progress.addWorkDone(1);
      this.injector.get(TrackService).create(track, () => progress.addWorkDone(1));
      this.trail.currentTrackUuid = track.uuid;
      this.injector.get(TrailService).doUpdate(this.trail, t => {
        t.currentTrackUuid = track.uuid;
        this.injector.get(TrackEditionService).computeFinalMetadata(t, track);
      }, () => {
        progress.addWorkDone(1);
        this.saving = false;
        this.modifiedTrack$.next(undefined);
        this.baseTrack$.next(undefined);
        this.currentTrackChanged();
      });
    }, 0);
  }

  close(): void {
    if (!this.canSave()) this.doClose();
    else this.injector.get(AlertController).create({
      header: this.i18n.texts.track_edit_tools.close_confirmation.title,
      message: this.i18n.texts.track_edit_tools.close_confirmation.message,
      buttons: [
        {
          text: this.i18n.texts.buttons.confirm,
          role: 'confirm',
          handler: () => {
            this.injector.get(AlertController).dismiss();
            this.doClose();
          }
        }, {
          text: this.i18n.texts.buttons.cancel,
          role: 'cancel',
          handler: () => {
            this.injector.get(AlertController).dismiss();
          }
        }
      ]
    }).then(a => a.present());
  }

  private doClose(): void {
    this.onClose.emit(true);
  }
}
