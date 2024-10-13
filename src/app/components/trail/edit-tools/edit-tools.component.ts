import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject, first, map, Observable, of, Subscription, switchMap, tap } from 'rxjs';
import { Track } from 'src/app/model/track';
import { Trail } from 'src/app/model/trail';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonFooter, IonButtons, IonButton, IonList, IonItem, IonModal, IonRange } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrackService } from 'src/app/services/database/track.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { adjustUnprobableElevationToTrack } from 'src/app/services/track-edition/elevation/unprobable-elevation';
import { IdGenerator } from 'src/app/utils/component-utils';
import { CommonModule } from '@angular/common';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { applyElevationThresholdToTrack } from 'src/app/services/track-edition/elevation/elevation-threshold';
import { detectLongBreaksFromTrack } from 'src/app/services/track-edition/time/break-detection';
import { Point } from 'src/app/model/point';
import { GeoService } from 'src/app/services/geolocation/geo.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { MapComponent } from '../../map/map.component';
import { MapAnchor } from '../../map/markers/map-anchor';
import { MapTrackPointReference } from '../../map/track/map-track-point-reference';
import { WayPoint } from 'src/app/model/way-point';
import { TrackEditionService } from 'src/app/services/track-edition/track-edition.service';

interface HistoryState {
  base: Track | undefined;
  modified: Track | undefined;
}

@Component({
  selector: 'app-edit-tools',
  templateUrl: './edit-tools.component.html',
  styleUrls: ['./edit-tools.component.scss'],
  standalone: true,
  imports: [IonRange, IonModal, IonItem, IonList, IonButton, IonButtons, IonFooter, IonContent, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, CommonModule]
})
export class EditToolsComponent implements OnInit, OnDestroy {

  @Input() trail!: Trail;
  @Input() baseTrack$!: BehaviorSubject<Track | undefined>;
  @Input() modifiedTrack$!: BehaviorSubject<Track | undefined>;
  @Input() focusTrack$!: BehaviorSubject<Track | undefined>;
  @Input() map!: MapComponent;
  @Input() close!: () => void;
  @Input() getMe!: (me: EditToolsComponent) => void;

  id = IdGenerator.generateId();
  history: HistoryState[] = [];
  undone: HistoryState[] = [];

  inlineTool: any;

  elevationFormatter = (value: number) => this.i18n.elevationInUserUnitToString(value);
  distanceFormatter = (value: number) => this.i18n.distanceInUserUnitToString(value);
  millisToMinutesFormatter = (millis: number) => this.i18n.durationToString(millis, false);

  constructor(
    public i18n: I18nService,
    private trackService: TrackService,
    private trailService: TrailService,
    private auth: AuthService,
    public prefs: PreferencesService,
    private geo: GeoService,
    private editionService: TrackEditionService,
    private changesDetector: ChangeDetectorRef,
  ) { }

  private mapClickSubscription?: Subscription;
  private selectedPointAnchor = new MapAnchor({lat: 0, lng: 0}, '#6060FFC0', undefined, undefined, undefined, '#6060FF80', undefined);
  selectedPoint?: MapTrackPointReference;
  ngOnInit(): void {
    this.mapClickSubscription = this.map.mouseClickPoint.subscribe(event => {
      if (event.length === 0) {
        if (this.selectedPoint) {
          this.selectedPoint = undefined;
          this.map.removeFromMap(this.selectedPointAnchor.marker);
        }
        this.changesDetector.detectChanges();
        return;
      }
      if (this.inlineTool) return;
      this.getTrack().subscribe(track => {
        const points = event.filter(p => p.track.track === track).sort((p1,p2) => p1.distanceToEvent - p2.distanceToEvent);
        const point = points.length > 0 ? points[0] : undefined;
        if (!point) {
          if (this.selectedPoint) {
            this.selectedPoint = undefined;
            this.map.removeFromMap(this.selectedPointAnchor.marker);
          }
        } else {
          this.selectedPointAnchor.marker.setLatLng(point.position);
          if (!this.selectedPoint)
            this.map.addToMap(this.selectedPointAnchor.marker);
          this.selectedPoint = point;
        }
        this.changesDetector.detectChanges();
      });
    });
    this.getMe(this);
  }
  ngOnDestroy(): void {
    this.mapClickSubscription?.unsubscribe();
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
    this.inlineTool = undefined;
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

  private getTrack(): Observable<Track> {
    if (this.modifiedTrack$.value)
      return of(this.modifiedTrack$.value);
    if (this.baseTrack$.value)
      return of(this.baseTrack$.value);
    return this.trackService.getFullTrackReady$(this.trail.currentTrackUuid, this.trail.owner).pipe(first());
  }

  public modify(): Observable<Track> {
    return this.modifiedTrack$.pipe(
      first(),
      switchMap(previous => {
        if (previous) {
          this.pushHistory();
          const copy = previous.copy(this.auth.email!);
          this.modifiedTrack$.next(copy);
          return of(copy);
        }
        if (this.baseTrack$.value) {
          this.pushHistory();
          const copy = this.baseTrack$.value.copy(this.auth.email!);
          this.modifiedTrack$.next(copy);
          return of(copy);
        }
        return this.trackService.getFullTrackReady$(this.trail.currentTrackUuid, this.trail.owner).pipe(
          first(),
          map(track => {
            this.pushHistory();
            const copy = track.copy(this.auth.email!);
            this.modifiedTrack$.next(copy);
            return copy;
          })
        );
      })
    );
  }

  getSelectedPointDistance(): number {
    if (!this.selectedPoint) return 0;
    let distance = 0;
    for (let i = 0; i < this.selectedPoint.segmentIndex!; ++i) distance += (this.selectedPoint.track.track as Track).segments[i].computeTotalDistance();
    distance += (this.selectedPoint.track.track as Track).segments[this.selectedPoint.segmentIndex!].distanceFromSegmentStart(this.selectedPoint.pointIndex);
    return distance;
  }

  removeSelectedPoint(): void {
    this.modify().subscribe(track => {
      if (this.selectedPoint?.segmentIndex === undefined) return;
      track.segments[this.selectedPoint.segmentIndex].removePointAt(this.selectedPoint.pointIndex);
      this.selectedPoint = undefined;
      this.map.removeFromMap(this.selectedPointAnchor.marker);
    });
  }

  removeAllPointsAfterSelected(): void {
    this.modify().subscribe(track => {
      const si = this.selectedPoint?.segmentIndex;
      if (si === undefined) return;
      while (track.segments.length > si + 1) track.removeSegmentAt(si + 1);
      const pi = this.selectedPoint?.pointIndex!;
      const segment = track.segments[si];
      if (pi < segment.points.length - 1) {
        segment.removeMany(segment.points.slice(pi + 1));
      }
      this.selectedPoint = undefined;
      this.map.removeFromMap(this.selectedPointAnchor.marker);
    });
  }

  removeAllPointsBeforeSelected(): void {
    this.modify().subscribe(track => {
      let si = this.selectedPoint?.segmentIndex;
      if (si === undefined) return;
      while (si > 0) {
        track.removeSegmentAt(0);
        si--;
      }
      const pi = this.selectedPoint?.pointIndex!;
      const segment = track.segments[0];
      if (pi > 0) {
        segment.removeMany(segment.points.slice(0, pi));
      }
      this.selectedPoint = undefined;
      this.map.removeFromMap(this.selectedPointAnchor.marker);
    });
  }

  createWayPoint(): void {
    this.modify().subscribe(track => {
      track.appendWayPoint(new WayPoint(this.selectedPoint!.point as Point, '', ''));
      this.selectedPoint = undefined;
      this.map.removeFromMap(this.selectedPointAnchor.marker);
    });
  }

  downloadElevations(): void {
    this.modify().subscribe(
      track => {
        for (const segment of track.segments)
          for (const point of segment.points) {
            point.ele = undefined;
            point.eleAccuracy = undefined;
          }
        this.geo.fillTrackElevation(track).subscribe(() => this.modifiedTrack$.next(track));
      }
    );
  }

  removeUnprobableElevations(): void {
    this.modify().subscribe(
      track => {
        adjustUnprobableElevationToTrack(track);
      }
    );
  }

  getMinElevationThreshold(): number {
    switch (this.prefs.preferences.elevationUnit) {
      case 'METERS': return 1;
      case 'FOOT': return 5;
    }
  }

  getMaxElevationThreshold(): number {
    switch (this.prefs.preferences.elevationUnit) {
      case 'METERS': return 25;
      case 'FOOT': return 80;
    }
  }

  getElevationThresholdStep(): number {
    switch (this.prefs.preferences.elevationUnit) {
      case 'METERS': return 1;
      case 'FOOT': return 5;
    }
  }

  getInitialElevationThreshold(): number {
    switch (this.prefs.preferences.elevationUnit) {
      case 'METERS': return 10;
      case 'FOOT': return 30;
    }
  }

  getMinElevationThresholdDistance(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 25;
      case 'MILES': return 0.015;
    }
  }

  getMaxElevationThresholdDistance(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 1000;
      case 'MILES': return 0.6;
    }
  }

  getElevationThresholdDistanceStep(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 25;
      case 'MILES': return 0.015;
    }
  }

  getInitialElevationThresholdDistance(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 250;
      case 'MILES': return 0.15;
    }
  }

  applyElevationThreshold(elevation: any, distance: any): void {
    const threshold = this.i18n.elevationInMetersFromUserUnit(elevation);
    const maxDistance = this.i18n.distanceInMetersFromUserUnit(distance);
    this.modify().subscribe(track => applyElevationThresholdToTrack(track, threshold, maxDistance));
  }

  canJoinArrivalAndDeparture$(): Observable<boolean> {
    return this.getTrack().pipe(map(track => !!track.departurePoint && !!track.arrivalPoint && track.departurePoint.distanceTo(track.arrivalPoint!.pos) > 1 && track.departurePoint.distanceTo(track.arrivalPoint!.pos) < 100));
  }

  joinArrivalToDeparture(): void {
    this.modify().subscribe(track => {
      const segment = track.segments[track.segments.length - 1];
      const departure = track.departurePoint;
      if (!departure) return;
      segment.append(new Point(
        departure.pos.lat,
        departure.pos.lng,
        departure.ele,
        track.arrivalPoint!.time,
        departure.posAccuracy,
        departure.eleAccuracy,
        undefined, undefined
      ));
    });
  }

  joinDepartureToArrival(): void {
    this.modify().subscribe(track => {
      const segment = track.segments[0];
      const arrival = track.arrivalPoint;
      if (!arrival) return;
      segment.insert(0, new Point(
        arrival.pos.lat,
        arrival.pos.lng,
        arrival.ele,
        track.departurePoint!.time,
        arrival.posAccuracy,
        arrival.eleAccuracy,
        undefined, undefined
      ));
    });
  }

  getMinLongBreaksMovesDistance(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 15;
      case 'MILES': return 0.01;
    }
  }

  getMaxLongBreaksMovesDistance(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 200;
      case 'MILES': return 0.125;
    }
  }

  getLongBreaksMovesDistanceStep(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 5;
      case 'MILES': return 0.005;
    }
  }

  setInlineTool(tool: any): void {
    this.inlineTool = tool;
    this.changesDetector.detectChanges();
  }

  longBreaksDetected: {segmentIndex: number; startIndex: number; endIndex: number}[] | undefined = undefined;
  longBreaksMinDuration: any;
  longBreaksMaxDistance: any;
  longBreaksSkipped = 0;
  longBreaksTrack: Track | undefined = undefined;

  detectLongBreaks(minDuration: any, maxDistance: any): void {
    this.longBreaksMinDuration = minDuration;
    this.longBreaksMaxDistance = maxDistance;
    this.getTrack().subscribe(track => this.detectLongBreaksForTrack(track));
  }

  detectLongBreaksForTrack(track: Track): void {
    this.longBreaksTrack = track;
    this.focusTrack$.next(undefined);
    this.longBreaksDetected = detectLongBreaksFromTrack(track, this.longBreaksMinDuration, this.longBreaksMaxDistance).filter(b => b.endIndex > b.startIndex + 1);
    if (this.longBreaksSkipped > 0) this.longBreaksDetected = this.longBreaksDetected.splice(0, this.longBreaksSkipped);
    if (this.longBreaksDetected.length > 0)
      this.focusOn(track, this.longBreaksDetected[0].segmentIndex, this.longBreaksDetected[0].startIndex, this.longBreaksDetected[0].endIndex);
  }

  longBreakDetectedDuration(): number | undefined {
    const segment = this.longBreaksTrack!.segments[this.longBreaksDetected![0].segmentIndex];
    const startTime = segment.points[this.longBreaksDetected![0].startIndex].time;
    const endTime = segment.points[this.longBreaksDetected![0].endIndex].time;
    if (startTime === undefined || endTime === undefined) return undefined;
    return endTime - startTime;
  }

  longBreakStartBefore(): void {
    this.longBreaksDetected![0].startIndex--;
    this.focusOn(this.longBreaksTrack!, this.longBreaksDetected![0].segmentIndex, this.longBreaksDetected![0].startIndex, this.longBreaksDetected![0].endIndex);
  }
  longBreakStartAfter(): void {
    this.longBreaksDetected![0].startIndex++;
    this.focusOn(this.longBreaksTrack!, this.longBreaksDetected![0].segmentIndex, this.longBreaksDetected![0].startIndex, this.longBreaksDetected![0].endIndex);
  }
  longBreakEndBefore(): void {
    this.longBreaksDetected![0].endIndex--;
    this.focusOn(this.longBreaksTrack!, this.longBreaksDetected![0].segmentIndex, this.longBreaksDetected![0].startIndex, this.longBreaksDetected![0].endIndex);
  }
  longBreakEndAfter(): void {
    this.longBreaksDetected![0].endIndex++;
    this.focusOn(this.longBreaksTrack!, this.longBreaksDetected![0].segmentIndex, this.longBreaksDetected![0].startIndex, this.longBreaksDetected![0].endIndex);
  }
  longBreakEndCanGoAfter(): boolean {
    return this.longBreaksDetected![0].endIndex < this.longBreaksTrack!.segments[this.longBreaksDetected![0].segmentIndex].points.length - 1;
  }

  exitLongBreaksMovesDetection(): void {
    this.longBreaksSkipped = 0;
    this.longBreaksDetected = undefined;
    this.longBreaksTrack = undefined;
    this.inlineTool = undefined;
    this.focusTrack$.next(undefined);
  }

  removeCurrentLongBreakMoves(): void {
    this.modify().subscribe(track => {
      const segment = track.segments[this.longBreaksDetected![0].segmentIndex];
      segment.removeMany(segment.points.slice(this.longBreaksDetected![0].startIndex + 1, this.longBreaksDetected![0].endIndex + 1));
      this.longBreaksDetected![0].startIndex = -1;
      this.focusTrack$.next(undefined);
    });
  }

  goToNextLongBreakMoves(): void {
    if (this.longBreaksDetected![0].startIndex === -1)
      this.detectLongBreaks(this.longBreaksMinDuration, this.longBreaksMaxDistance);
    else {
      this.longBreaksSkipped++;
      this.longBreaksDetected!.splice(0, 1);
      if (this.longBreaksDetected!.length > 0)
        this.focusOn(this.longBreaksTrack!, this.longBreaksDetected![0].segmentIndex, this.longBreaksDetected![0].startIndex, this.longBreaksDetected![0].endIndex);
      else
        this.focusTrack$.next(undefined);
    }
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

  focusOn(track: Track, segmentIndex: number, startPoint: number, endPoint: number): void {
    this.focusTrack$.next(track.subTrack(segmentIndex, startPoint, segmentIndex, endPoint));
  }

}
