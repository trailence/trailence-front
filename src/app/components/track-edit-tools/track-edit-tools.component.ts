import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Injector, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { IonIcon, IonLabel, PopoverController, ToastController } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { PointReference, PointReferenceRange, TrackEditTool, TrackEditToolContext } from './tools/tool.interface';
import { RemoveUnprobableElevation } from './tools/elevation/remove-unprobable-elevation';
import { MenuContentComponent } from '../menu-content/menu-content.component';
import { MenuItem } from 'src/app/utils/menu-item';
import { BehaviorSubject, defaultIfEmpty, first, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { Track } from 'src/app/model/track';
import { AuthService } from 'src/app/services/auth/auth.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { SlopeThreshold } from './tools/elevation/slope-threshold/slope-threshold';
import { MapComponent } from '../map/map.component';
import { ElevationGraphComponent } from '../elevation-graph/elevation-graph.component';
import { MapTrackPointReference } from '../map/track/map-track-point-reference';
import { isRange, SelectionTool } from './tools/selection.tool';
import { TrackEditToolsStack } from './tools/track-edit-tools-stack';
import { SelectionComponent } from './tools/selection/selection.component';
import { RemoveSelectionTool } from './tools/selection/remove-selection';
import { RemoveBeforeSelectedPointTool } from './tools/selection/remove-before-selected-point';
import { RemoveAfterSelectedPointTool } from './tools/selection/remove-after-selected-point';
import { CreateWayPointTool } from './tools/path/create-way-point';
import { RemoveWayPointTool } from './tools/path/remove-way-point';
import { CloseSelectionTool } from './tools/selection/close-selection';
import { ReplaceElevationWithProvider } from './tools/elevation/replace-with-provider';
import { ImproveElevationWithProvider } from './tools/elevation/improve-with-provider';
import { JoinArrivalToDeparture } from './tools/path/join-arrival-to-departure';
import { JoinDepartureToArrival } from './tools/path/join-departure-to-arrival';
import { Trail } from 'src/app/model/trail';
import { BackToOriginalTrack } from './tools/track/back-to-original';
import { ToogleShowOnlyModifiedTrack } from './tools/track/toggle-show-only-modified-track';

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
export class TrackEditToolsComponent implements OnInit, OnChanges, OnDestroy {

  @Input() trail!: Trail;
  @Input() originalTrack$!: BehaviorSubject<Track | undefined>;
  @Input() modifiedTrack$!: BehaviorSubject<Track | undefined>;
  @Input() baseTrack$!: BehaviorSubject<Track | undefined>;
  @Input() focusTrack$!: BehaviorSubject<Track | undefined>;
  @Input() hideBaseTrack$!: BehaviorSubject<boolean>;

  @Input() map?: MapComponent;
  @Input() elevationGraph?: ElevationGraphComponent;

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
        new CreateWayPointTool(),
        new RemoveWayPointTool(),
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

  readonly context: TrackEditToolContext;
  readonly statesStack: TrackEditToolsState[] = [];
  readonly undoneStack: TrackEditToolsState[] = [];

  private toolsStack?: TrackEditToolsStack;

  private mapClickSubscription?: Subscription;
  private elevationGraphClickSubscription?: Subscription;
  private elevationGraphSelectionSubscription?: Subscription;

  constructor(
    public readonly i18n: I18nService,
    private readonly auth: AuthService,
    private readonly popoverController: PopoverController,
    private readonly toastController: ToastController,
    private readonly changesDetector: ChangeDetectorRef,
    readonly injector: Injector,
  ) {
    const that = this;
    this.context = {
      injector,
      selection: new SelectionTool(),
      currentTrack$: new BehaviorSubject<Track | undefined>(undefined),
      get map(): MapComponent | undefined {
        return that.map;
      },
      get elevationGraph(): ElevationGraphComponent | undefined {
        return that.elevationGraph;
      },

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

      focusOn: (track, startSegment, startPoint, endSegment, endPoint) => {
        this.focusTrack$.next(track.subTrack(startSegment, startPoint, endSegment, endPoint));
      },
      cancelFocus: () => {
        this.focusTrack$.next(undefined);
      },

      hasSelection() {
        return this.getTool(SelectionComponent) !== undefined;
      },
      getSelection() {
        return this.getTool(SelectionComponent)?.getSelection();
      },
      cancelSelection: () => this.cancelSelection(),
    };
  }

  ngOnInit(): void {
    this.context.trail = this.trail;
    this.currentTrackChanged();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['map']?.currentValue) {
      this.setMap(changes['map'].currentValue);
    }
    if (changes['elevationGraph']?.currentValue) {
      this.setElevationGraph(changes['elevationGraph'].currentValue);
    }
  }

  ngOnDestroy(): void {
    this.mapClickSubscription?.unsubscribe();
    this.elevationGraphClickSubscription?.unsubscribe();
    this.elevationGraphSelectionSubscription?.unsubscribe();
  }

  private setMap(map: MapComponent): void {
    this.mapClickSubscription?.unsubscribe();
    this.mapClickSubscription = map.mouseClickPoint.subscribe(event => {
      const mapPoints = event.filter(p => p.point !== undefined).sort(MapTrackPointReference.distanceComparator);
      const points = mapPoints.map(p => ({
        track: p.track.track,
        segmentIndex: p.segmentIndex,
        pointIndex: p.pointIndex,
        point: p.point,
      } as PointReference));
      this.pointClick(points);
    });
  }

  private setElevationGraph(graph: ElevationGraphComponent): void {
    this.elevationGraphClickSubscription?.unsubscribe();
    this.elevationGraphSelectionSubscription?.unsubscribe();
    this.elevationGraphClickSubscription = graph.pointClick.subscribe(event => {
      const points = event.map(p => ({
        track: p.track,
        segmentIndex: p.segmentIndex,
        pointIndex: p.pointIndex,
        point: p.track.segments[p.segmentIndex].points[p.pointIndex]
      } as PointReference));
      this.pointClick(points);
    });
    this.elevationGraphSelectionSubscription = graph.selected.subscribe(event => {
      const points = (event ?? []).map(range => ({
        track: range.track,
        start: {
          track: range.track,
          segmentIndex: range.start.segmentIndex,
          pointIndex: range.start.pointIndex,
          point: range.track.segments[range.start.segmentIndex].points[range.start.pointIndex]
        },
        end: {
          track: range.track,
          segmentIndex: range.end.segmentIndex,
          pointIndex: range.end.pointIndex,
          point: range.track.segments[range.end.segmentIndex].points[range.end.pointIndex]
        }
      } as PointReferenceRange));
      this.rangeSelected(points);
    });
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

  public modify(mayNotChange: boolean, modification: (track: Track) => Observable<any>): Observable<any> {
    return this.getCurrentTrack().pipe(
      map(track => track.copy(this.auth.email!)),
      switchMap(track => {
        const before = mayNotChange ? track.copy(this.auth.email!) : undefined;
        return modification(track).pipe(
          defaultIfEmpty(undefined),
          map(result => {
            if (mayNotChange && track.isEquals(before!)) {
              this.toastController.create({
                message: this.i18n.texts.track_edit_tools.no_modification,
                duration: 2000,
              })
              .then(toast => toast.present());
            } else {
              this.trackModified(track);
            }
            return result;
          })
        );
      })
    );
  }

  public modifySelectedRange(mayNotChange: boolean, modification: (track: Track) => Observable<any>): Observable<any> {
    const selection = this.context.getSelection();
    if (!isRange(selection)) return this.modify(mayNotChange, modification);
    const range = selection as PointReferenceRange;
    return this.getCurrentTrack().pipe(
      switchMap(fullTrack => {
        const subTrack = fullTrack.subTrack(range.start.segmentIndex, range.start.pointIndex, range.end.segmentIndex, range.end.pointIndex);
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
              const newTrack = fullTrack.copy(this.auth.email!)
              newTrack.replace(range.start.segmentIndex, range.start.pointIndex, range.end.segmentIndex, range.end.pointIndex, subTrack);
              this.trackModified(newTrack);
            }
            return result;
          })
        );
      }),
    );
  }

  private pointClick(points: PointReference[]): void {
    if (points.length === 0) {
      this.context.selection.cancel(this.context);
      return;
    }
    this.getCurrentTrack().subscribe(track => {
      const point = points.find(p => p.track === track);
      if (!point) return;
      this.context.selection.selectPoint(this.context, point);
    });
  }

  private rangeSelected(ranges: PointReferenceRange[]): void {
    this.getCurrentTrack().subscribe(track => {
      const range = ranges.find(r => r.track === track);
      if (!range) return;
      this.context.selection.selectRange(this.context, range);
    });
  }

  cancelSelection(): void {
    this.context.removeTool(SelectionComponent);
  }
}
