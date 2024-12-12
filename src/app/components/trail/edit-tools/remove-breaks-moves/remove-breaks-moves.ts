import { Component, Input, OnChanges, SimpleChanges } from "@angular/core";
import { EditTool } from "../tool.interface";
import { CommonModule } from "@angular/common";
import { I18nService } from "src/app/services/i18n/i18n.service";
import { Track } from "src/app/model/track";
import { EditToolsComponent } from "../edit-tools.component";
import { BreakPointSection, detectLongBreaksFromTrack } from "src/app/services/track-edition/time/break-detection";
import { IonRange, IonLabel, IonButton, IonButtons, IonList, IonItem, IonFooter, IonToolbar } from "@ionic/angular/standalone";
import { PreferencesService } from "src/app/services/preferences/preferences.service";

@Component({
    selector: 'app-edit-tool-remove-breaks-moves',
    templateUrl: './remove-breaks-moves.html',
    styleUrls: ['./remove-breaks-moves.scss'],
    imports: [
      CommonModule,
      IonRange, IonLabel, IonButton, IonButtons, IonList, IonItem, IonFooter, IonToolbar,
    ]
})
export class RemoveBreaksMoves implements EditTool, OnChanges {

  @Input() editTools!: EditToolsComponent;

  public readonly hasOwnFooter = true;

  millisToMinutesFormatter = (millis: number) => this.i18n.durationToString(millis, false);
  smallDistanceFormatter = (value: number) => {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return value + 'm';
      case 'IMPERIAL': return value + 'ft';
    }
  }

  constructor(
    public readonly i18n: I18nService,
    public readonly prefs: PreferencesService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.editTools.trailComponent.showBreaks$.value)
      this.editTools.trailComponent.showBreaks$.next(true);
  }

  getMinLongBreaksMovesDistance(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 15;
      case 'IMPERIAL': return 50;
    }
  }

  getMaxLongBreaksMovesDistance(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 200;
      case 'IMPERIAL': return 650;
    }
  }

  getLongBreaksMovesDistanceStep(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 5;
      case 'IMPERIAL': return 10;
    }
  }

  getMinLongBreaksMovesDistanceInitialValue(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return this.prefs.preferences.longBreakMaximumDistance;
      case 'IMPERIAL': {
        const foot = this.i18n.metersToFoot(this.prefs.preferences.longBreakMaximumDistance);
        if (foot < 50) return 50;
        if (foot > 650) return 650;
        return 50 + Math.round((foot - 50) / 10) * 10;
      }
    }
  }


  longBreaksDetected: BreakPointSection[] | undefined = undefined;
  longBreaksMinDuration: any;
  longBreaksMaxDistance: any;
  longBreaksSkipped = 0;
  longBreaksTrack: Track | undefined = undefined;

  detectLongBreaks(minDuration: any, maxDistance: any): void {
    this.longBreaksMinDuration = minDuration;
    this.longBreaksMaxDistance = maxDistance;
    this.editTools.getTrack().subscribe(track => this.detectLongBreaksForTrack(track));
  }

  detectLongBreaksForTrack(track: Track): void {
    this.longBreaksTrack = track;
    this.editTools.cancelFocus();
    this.longBreaksDetected = detectLongBreaksFromTrack(track, this.longBreaksMinDuration, this.longBreaksMaxDistance).filter(b => b.endIndex > b.startIndex + 1);
    if (this.longBreaksSkipped > 0) this.longBreaksDetected = this.longBreaksDetected.splice(0, this.longBreaksSkipped);
    if (this.longBreaksDetected.length > 0)
      this.editTools.focusOn(track, this.longBreaksDetected[0].segmentIndex, this.longBreaksDetected[0].startIndex, this.longBreaksDetected[0].segmentIndex, this.longBreaksDetected[0].endIndex);
  }

  longBreakDetectedDuration(): number | undefined {
    const segment = this.longBreaksTrack!.segments[this.longBreaksDetected![0].segmentIndex];
    const startTime = segment.points[this.longBreaksDetected![0].startIndex].time;
    let endIndex = this.longBreaksDetected![0].endIndex;
    if (endIndex < segment.points.length - 1) endIndex++;
    const endTime = segment.points[endIndex].time;
    if (startTime === undefined || endTime === undefined) return undefined;
    return endTime - startTime;
  }

  longBreakStartBefore(): void {
    this.longBreaksDetected![0].startIndex--;
    this.editTools.focusOn(this.longBreaksTrack!, this.longBreaksDetected![0].segmentIndex, this.longBreaksDetected![0].startIndex, this.longBreaksDetected![0].segmentIndex, this.longBreaksDetected![0].endIndex);
  }
  longBreakStartAfter(): void {
    this.longBreaksDetected![0].startIndex++;
    this.editTools.focusOn(this.longBreaksTrack!, this.longBreaksDetected![0].segmentIndex, this.longBreaksDetected![0].startIndex, this.longBreaksDetected![0].segmentIndex, this.longBreaksDetected![0].endIndex);
  }
  longBreakEndBefore(): void {
    this.longBreaksDetected![0].endIndex--;
    this.editTools.focusOn(this.longBreaksTrack!, this.longBreaksDetected![0].segmentIndex, this.longBreaksDetected![0].startIndex, this.longBreaksDetected![0].segmentIndex, this.longBreaksDetected![0].endIndex);
  }
  longBreakEndAfter(): void {
    this.longBreaksDetected![0].endIndex++;
    this.editTools.focusOn(this.longBreaksTrack!, this.longBreaksDetected![0].segmentIndex, this.longBreaksDetected![0].startIndex, this.longBreaksDetected![0].segmentIndex, this.longBreaksDetected![0].endIndex);
  }
  longBreakEndCanGoAfter(): boolean {
    return this.longBreaksDetected![0].endIndex < this.longBreaksTrack!.segments[this.longBreaksDetected![0].segmentIndex].points.length - 1;
  }

  exit(): void {
    this.longBreaksSkipped = 0;
    this.longBreaksDetected = undefined;
    this.longBreaksTrack = undefined;
    this.editTools.cancelFocus();
    this.editTools.setInlineTool(undefined);
  }

  removeCurrentLongBreakMoves(): void {
    this.editTools.modify().subscribe(track => {
      const breakDetected = this.longBreaksDetected![0];
      const segment = track.segments[breakDetected.segmentIndex];
      const toRemove = [];
      if (breakDetected.startIndex < breakDetected.pointIndex) toRemove.push(...segment.points.slice(breakDetected.startIndex + 1, breakDetected.pointIndex));
      if (breakDetected.endIndex > breakDetected.pointIndex) toRemove.push(...segment.points.slice(breakDetected.pointIndex + 1, breakDetected.endIndex + 1));
      segment.removeMany(toRemove);
      breakDetected.startIndex = -1;
      this.editTools.cancelFocus();
    });
  }

  goToNextLongBreakMoves(): void {
    if (this.longBreaksDetected![0].startIndex === -1)
      this.detectLongBreaks(this.longBreaksMinDuration, this.longBreaksMaxDistance);
    else {
      this.longBreaksSkipped++;
      this.longBreaksDetected!.splice(0, 1);
      if (this.longBreaksDetected!.length > 0)
        this.editTools.focusOn(this.longBreaksTrack!, this.longBreaksDetected![0].segmentIndex, this.longBreaksDetected![0].startIndex, this.longBreaksDetected![0].segmentIndex, this.longBreaksDetected![0].endIndex);
      else
        this.editTools.cancelFocus();
    }
  }

}
