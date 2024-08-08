import { Component, Input } from '@angular/core';
import { BehaviorSubject, first, map, Observable, of, switchMap, tap } from 'rxjs';
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
export class EditToolsComponent {

  @Input() trail!: Trail;
  @Input() baseTrack$!: BehaviorSubject<Track | undefined>;
  @Input() modifiedTrack$!: BehaviorSubject<Track | undefined>;
  @Input() focusTrack$!: BehaviorSubject<Track | undefined>;
  @Input() close!: () => void;

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
    private auth: AuthService,
    public prefs: PreferencesService,
  ) { }

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
    this.pushHistory();
    const state = this.undone.splice(this.undone.length - 1, 1)[0];
    this.baseTrack$.next(state.base);
    this.modifiedTrack$.next(state.modified);
  }

  private pushHistory(): void {
    this.history.push({
      base: this.baseTrack$.value,
      modified: this.modifiedTrack$.value,
    });
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

  private modify(): Observable<Track> {
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

  longBreaksDetected: {segmentIndex: number; startIndex: number; endIndex: number}[] | undefined = undefined;
  longBreaksMinDuration: any;
  longBreaksMaxDistance: any;
  longBreaksSkipped = 0;
  longBreaksTrack: Track | undefined = undefined;

  detectLongBreaks(minDuration: any, maxDistance: any): void {
    this.longBreaksMinDuration = minDuration;
    this.longBreaksMaxDistance = maxDistance;
    if (this.modifiedTrack$.value)
      this.detectLongBreaksForTrack(this.modifiedTrack$.value);
    else if (this.baseTrack$.value)
      this.detectLongBreaksForTrack(this.baseTrack$.value);
    else
      this.trackService.getFullTrackReady$(this.trail.currentTrackUuid, this.trail.owner).pipe(first()).subscribe(track => this.detectLongBreaksForTrack(track));
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

  exitLongBreaksMovesDetection(): void {
    this.longBreaksSkipped = 0;
    this.longBreaksDetected = undefined;
    this.longBreaksTrack = undefined;
    this.inlineTool = undefined;
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
      this.longBreaksDetected?.splice(0, 1);
      if (this.longBreaksDetected!.length > 0)
        this.focusOn(this.focusTrack$.value!, this.longBreaksDetected![0].segmentIndex, this.longBreaksDetected![0].startIndex, this.longBreaksDetected![0].endIndex);
      else
        this.focusTrack$.next(undefined);
    }
  }

  focusOn(track: Track, segmentIndex: number, startPoint: number, endPoint: number): void {
    this.focusTrack$.next(track.subTrack(segmentIndex, startPoint, segmentIndex, endPoint));
  }

}
