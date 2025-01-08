import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit, Type, ViewChild } from '@angular/core';
import { BehaviorSubject, defaultIfEmpty, first, map, Observable, of, Subscription, switchMap, tap } from 'rxjs';
import { Track } from 'src/app/model/track';
import { Trail } from 'src/app/model/trail';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonFooter, IonButton, IonList, IonItem, IonCheckbox, ToastController, ModalController } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrackService } from 'src/app/services/database/track.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { CommonModule } from '@angular/common';
import { GeoService } from 'src/app/services/geolocation/geo.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { MapComponent } from '../../map/map.component';
import { TrackEditionService } from 'src/app/services/track-edition/track-edition.service';
import { IconLabelButtonComponent } from '../../icon-label-button/icon-label-button.component';
import { EditTool } from './tool.interface';
import { RemoveBreaksMoves } from './remove-breaks-moves/remove-breaks-moves';
import { ElevationThresholdModal } from './elevation-threshold/elevation-threshold-modal';
import { ToolRenderer } from './tool-renderer';
import { SelectionTool } from './selection/selection-tool';
import { PathRange } from '../path-selection';
import { TrailComponent } from '../trail.component';
import { adjustUnprobableElevationToTrackBasedOnGrade } from 'src/app/services/track-edition/elevation/unprobable-elevation-with-grade';

interface HistoryState {
  base: Track | undefined;
  modified: Track | undefined;
}

@Component({
    selector: 'app-edit-tools',
    templateUrl: './edit-tools.component.html',
    styleUrls: ['./edit-tools.component.scss'],
    imports: [IonCheckbox, IonItem, IonList, IonButton, IonFooter, IonContent, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, CommonModule, IconLabelButtonComponent, ToolRenderer]
})
export class EditToolsComponent implements OnInit, OnDestroy {

  @Input() trail!: Trail;
  @Input() baseTrack$!: BehaviorSubject<Track | undefined>;
  @Input() modifiedTrack$!: BehaviorSubject<Track | undefined>;
  @Input() focusTrack$!: BehaviorSubject<Track | undefined>;
  @Input() hideBaseTrack$!: BehaviorSubject<boolean>;
  @Input() map!: MapComponent;
  @Input() trailComponent!: TrailComponent;
  @Input() close!: () => void;
  @Input() getMe!: (me: EditToolsComponent) => void;

  history: HistoryState[] = [];
  undone: HistoryState[] = [];

  that: EditToolsComponent = this;
  inlineToolType: Type<EditTool> | undefined;
  inlineToolCallback?: (tool: EditTool) => void;

  @ViewChild('inlineToolRenderer') inlineToolRenderer?: ToolRenderer;

  constructor(
    public readonly i18n: I18nService,
    private readonly trackService: TrackService,
    private readonly trailService: TrailService,
    private readonly auth: AuthService,
    private readonly geo: GeoService,
    private readonly editionService: TrackEditionService,
    public readonly changesDetector: ChangeDetectorRef,
    private readonly toastController: ToastController,
    private readonly modalController: ModalController,
  ) { }

  private mapClickSubscription?: Subscription;
  ngOnInit(): void {
    this.mapClickSubscription = this.map.mouseClickPoint.subscribe(event => {
      if (this.inlineToolRenderer?.tool) {
        if (this.inlineToolRenderer.tool.onMapClick) this.inlineToolRenderer.tool.onMapClick(event);
      } else if (event.length !== 0) {
        this.setInlineTool(SelectionTool, tool => tool.onMapClick(event));
      }
    });
    this.getMe(this);
  }

  ngOnDestroy(): void {
    this.mapClickSubscription?.unsubscribe();
  }

  setSelection(range: PathRange): boolean {
    if (!this.inlineToolRenderer?.tool) {
      this.setInlineTool(SelectionTool, tool => tool.setSelection(range));
      return true;
    } else if (this.inlineToolRenderer.tool instanceof SelectionTool) {
      this.inlineToolRenderer.tool.setSelection(range);
      return true;
    }
    return false;
  }

  undo(): void {
    this.undone.push({
      base: this.baseTrack$.value,
      modified: this.modifiedTrack$.value,
    });
    const state = this.history.splice(this.history.length - 1, 1)[0];
    this.baseTrack$.next(state.base);
    this.modifiedTrack$.next(state.modified);
  }

  redo(): void {
    const state = this.undone.splice(this.undone.length - 1, 1)[0];
    const newUndone = this.undone;
    this.pushHistory();
    this.undone = newUndone;
    this.baseTrack$.next(state.base);
    this.modifiedTrack$.next(state.modified);
  }

  private pushHistory(): void {
    this.history.push({
      base: this.baseTrack$.value,
      modified: this.modifiedTrack$.value,
    });
    this.undone = [];
  }

  canSave(): boolean {
    return !!this.baseTrack$.value || !!this.modifiedTrack$.value;
  }

  save(): void {
    let track = (this.modifiedTrack$.value || this.baseTrack$.value)!;
    track = track.copy(this.auth.email!);
    this.trackService.create(track);
    this.trail.currentTrackUuid = track.uuid;
    this.trailService.doUpdate(this.trail, t => {
      t.currentTrackUuid = track.uuid;
      this.editionService.computeFinalMetadata(t, track);
    });
    this.history = [];
    this.undone = [];
    this.inlineToolType = undefined;
    this.inlineToolCallback = undefined;
    this.focusTrack$.next(undefined);
    this.modifiedTrack$.next(undefined);
    this.baseTrack$.next(undefined);
  }

  backToOriginalTrack(): void {
    this.trackService.getFullTrackReady$(this.trail.originalTrackUuid, this.trail.owner).subscribe(
      originalTrack => {
        this.pushHistory();
        this.baseTrack$.next(originalTrack);
        this.modifiedTrack$.next(undefined);
      }
    );
  }

  showOnlyModified(value: boolean): void {
    this.hideBaseTrack$.next(value);
    this.changesDetector.detectChanges();
  }

  public getTrack(): Observable<Track> {
    if (this.modifiedTrack$.value)
      return of(this.modifiedTrack$.value);
    if (this.baseTrack$.value)
      return of(this.baseTrack$.value);
    return this.trackService.getFullTrackReady$(this.trail.currentTrackUuid, this.trail.owner).pipe(first());
  }

  public modify(): Observable<Track> {
    return this.getTrackForModification().pipe(
      tap(track => {
        this.pushHistory();
        this.modifiedTrack$.next(track);
      })
    );
  }

  public mayModify(modification: (track: Track) => Observable<any>) {
    this.getTrackForModification().subscribe(
      track => {
        const before = track.copy(this.auth.email!);
        modification(track).pipe(defaultIfEmpty(true)).subscribe(() => {
          if (before.isEquals(track)) {
            this.toastController.create({
              message: this.i18n.texts.pages.trail.edit_tools.no_modification,
              duration: 2000,
            })
            .then(toast => toast.present());
            return;
          }
          this.pushHistory();
          this.modifiedTrack$.next(track);
        });
      }
    );
  }

  private getTrackForModification(): Observable<Track> {
    return this.modifiedTrack$.pipe(
      first(),
      switchMap(previous => {
        if (previous) {
          return of(previous.copy(this.auth.email!));
        }
        if (this.baseTrack$.value) {
          return of(this.baseTrack$.value.copy(this.auth.email!));
        }
        return this.trackService.getFullTrackReady$(this.trail.currentTrackUuid, this.trail.owner).pipe(
          first(),
          map(track => {
            return track.copy(this.auth.email!);
          })
        );
      })
    );
  }

  downloadElevations(): void {
    this.mayModify(track => {
      for (const segment of track.segments)
        for (const point of segment.points) {
          point.ele = undefined;
          point.eleAccuracy = undefined;
        }
      return this.geo.fillTrackElevation(track);
    });
  }

  removeUnprobableElevations(): void {
    this.mayModify(track => of(adjustUnprobableElevationToTrackBasedOnGrade(track)));
  }

  openElevationThresholdModal(): void {
    this.modalController.create({
      component: ElevationThresholdModal,
      componentProps: {
        editTools: this
      }
    }).then(m => m.present());
  }

  canJoinArrivalAndDeparture$(): Observable<boolean> {
    return this.getTrack().pipe(map(track => !!track.departurePoint && !!track.arrivalPoint && track.departurePoint.distanceTo(track.arrivalPoint.pos) > 1 && track.departurePoint.distanceTo(track.arrivalPoint.pos) < 100));
  }

  joinArrivalToDeparture(): void {
    this.modify().subscribe(track => {
      const segment = track.segments[track.segments.length - 1];
      const departure = track.departurePoint;
      if (!departure) return;
      segment.append({
        pos: {
          lat: departure.pos.lat,
          lng: departure.pos.lng,
        },
        ele: departure.ele,
        time: track.arrivalPoint!.time,
        posAccuracy: departure.posAccuracy,
        eleAccuracy: departure.eleAccuracy
      });
    });
  }

  joinDepartureToArrival(): void {
    this.modify().subscribe(track => {
      const segment = track.segments[0];
      const arrival = track.arrivalPoint;
      if (!arrival) return;
      segment.insert(0, {
        pos : {
          lat: arrival.pos.lat,
          lng: arrival.pos.lng,
        },
        ele: arrival.ele,
        time: track.departurePoint!.time,
        posAccuracy: arrival.posAccuracy,
        eleAccuracy: arrival.eleAccuracy,
      });
    });
  }

  setInlineToolRemoveBreaksMoves(): void {
    this.setInlineTool(RemoveBreaksMoves);
  }

  setInlineTool<T extends EditTool>(tool: Type<T> | undefined, onCreated?: (tool: T) => void): void {
    this.inlineToolType = tool;
    this.inlineToolCallback = onCreated as (tool: EditTool) => void;
    this.changesDetector.detectChanges();
  }

  canMergeSegments(): Observable<boolean> {
    return this.getTrack().pipe(map(track => track.segments.length > 1));
  }

  mergeSegments(): void {
    this.modify().subscribe(track => {
      track.removeEmptySegments();
      while (track.segments.length > 1) {
        track.segments[0].appendMany(track.segments[1].points);
        track.removeSegmentAt(1);
      }
    });
  }

  focusOn(track: Track, startSegment: number, startPoint: number, endSegment: number, endPoint: number): void {
    this.focusTrack$.next(track.subTrack(startSegment, startPoint, endSegment, endPoint));
  }

  cancelFocus(): void {
    this.focusTrack$.next(undefined);
  }

}
