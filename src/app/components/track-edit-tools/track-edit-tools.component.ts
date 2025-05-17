import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Injector, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { IonIcon, IonLabel, PopoverController, ToastController } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrackEditTool, TrackEditToolContext } from './tools/tool.interface';
import { RemoveUnprobableElevation } from './tools/elevation/remove-unprobable-elevation';
import { MenuContentComponent } from '../menu-content/menu-content.component';
import { MenuItem } from 'src/app/utils/menu-item';
import { BehaviorSubject, defaultIfEmpty, first, map, Observable, of, Subscription, switchMap } from 'rxjs';
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

interface ToolsCategory {
  icon: string;
  label: string;
  tools: (TrackEditTool | null | ToolsCategory)[];
}

interface TrackEditToolsState {
  baseTrack?: Track;
  modifiedTrack?: Track;
}

@Component({
  selector: 'app-track-edit-tools',
  templateUrl: './track-edit-tools.component.html',
  styleUrl: './track-edit-tools.component.scss',
  imports: [
    CommonModule,
    IonLabel, IonIcon,
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

  private readonly allCategories: ToolsCategory[] = [
    {
      icon: 'selection',
      label: 'selection',
      tools: [
        new CloseSelectionTool(),
        null,
        new RemoveSelectionTool(),
        new RemoveBeforeSelectedPointTool(),
        new RemoveAfterSelectedPointTool(),
      ],
    }, {
      icon: 'distance',
      label: 'track',
      tools: [
        new BackToOriginalTrack(),
        new ToogleShowOnlyModifiedTrack(),
      ],
    }, {
      icon: 'location',
      label: 'way_point',
      tools: [
        new CreateWayPointTool(),
        new EditWayPointTool(),
        new RemoveWayPointTool(),
      ]
    }, {
      icon: 'elevation',
      label: 'elevation',
      tools: [
        new RemoveUnprobableElevation(),
        new SlopeThreshold(),
        {
          icon: '',
          label: 'elevation_provider',
          tools: [
            new ImproveElevationWithProvider(),
            new ReplaceElevationWithProvider(),
          ]
        }
      ],
    }, {
      icon: 'path',
      label: 'path',
      tools: [
        {
          icon: '',
          label: 'join_departure_and_arrival',
          tools: [
            new JoinArrivalToDeparture(),
            new JoinDepartureToArrival(),
          ]
        }
      ],
    }
  ];
  categories: ToolsCategory[] = [];

  context!: TrackEditToolContext;
  readonly statesStack: TrackEditToolsState[] = [];
  readonly undoneStack: TrackEditToolsState[] = [];

  private toolsStack?: TrackEditToolsStack;
  private selectionSubscription?: Subscription;

  constructor(
    public readonly i18n: I18nService,
    private readonly auth: AuthService,
    private readonly popoverController: PopoverController,
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
        this.pushHistory();
        this.baseTrack$.next(track);
        this.modifiedTrack$.next(undefined);
        this.refreshTools();
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
    this.selectionSubscription = this.selection.selection$.subscribe(sel => {
      if (!sel) this.context.removeTool(SelectionComponent);
      else this.context.insertTool({component: SelectionComponent, onCreated: () => {}});
      this.refreshTools();
    });
  }

  ngOnDestroy(): void {
    this.selectionSubscription?.unsubscribe();
  }

  refreshTools(): void {
    this.categories = [];
    for (const c of this.allCategories) {
      const filtered = this.filterCategory(c);
      if (filtered) this.categories.push(filtered);
    }
    this.changesDetector.detectChanges();
  }

  private filterCategory(category: ToolsCategory): ToolsCategory | undefined {
    const c: ToolsCategory = {...category};
    c.tools = [...c.tools];
    for (let i = 0; i < c.tools.length; ++i) {
      if (c.tools[i] === null) {
        // separator
        if ((i > 0 && c.tools[i - 1] === null) || (i === 0)) {
          c.tools.splice(i, 1);
          i--;
        }
      } else if ((c.tools[i] as any)['tools'] !== undefined) {
        // category
        const sub = this.filterCategory(c.tools[i] as ToolsCategory);
        if (!sub) {
          c.tools.splice(i, 1);
          i--;
        }
      } else {
        // tool
        const tool = c.tools[i] as TrackEditTool;
        if (!tool.isAvailable(this.context)) {
          c.tools.splice(i, 1);
          i--;
        }
      }
    }
    if (c.tools.length > 0 && c.tools[c.tools.length - 1] === null) {
      // remove separator if at end
      c.tools.splice(c.tools.length - 1, 1);
    }
    if (c.tools.length === 0) return undefined;
    return c;
  }

  openCategory(category: ToolsCategory, event: MouseEvent): void {
    this.popoverController.create({
      component: MenuContentComponent,
      componentProps: {
        menu: this.getCategoryMenu(category)
      },
      event: event,
      side: 'bottom',
      alignment: 'center',
      cssClass: 'always-tight-menu',
      dismissOnSelect: true,
      arrow: true,
    }).then(p => p.present());
  }

  private getCategoryMenu(category: ToolsCategory): MenuItem[] {
    const menu: MenuItem[] = [];
    menu.push(new MenuItem().setIcon(category.icon).setI18nLabel('track_edit_tools.categories.' + category.label).setTextColor('secondary'));
    for (const t of category.tools) {
      if (!t) {
        menu.push(new MenuItem());
        continue;
      }
      if ((t as any)['tools'] !== undefined) {
        // sub-category
        menu.push(...this.getCategoryMenu(t as ToolsCategory));
        continue;
      }
      const tool = t as TrackEditTool;
      const item = new MenuItem();
      if (tool.icon) item.setIcon(tool.icon);
      item.setI18nLabel('track_edit_tools.tools.' + tool.labelKey(this.context));
      item.setColor(tool.backgroundColor);
      item.setTextColor(tool.textColor);
      item.setAction(() => {
        this.popoverController.dismiss();
        tool.execute(this.context);
      });
      menu.push(item);
    }
    return menu;
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
      modifiedTrack: this.modifiedTrack$.value
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
}
