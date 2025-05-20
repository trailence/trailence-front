import { Injectable } from '@angular/core';
import { Track } from 'src/app/model/track';
import { applyElevationThresholdToSegment, applyElevationThresholdToTrack } from './elevation/elevation-threshold';
import { Segment } from 'src/app/model/segment';
import { adjustUnprobableElevationToSegmentBasedOnGrade, adjustUnprobableElevationToTrackBasedOnGrade } from './elevation/unprobable-elevation-with-grade';
import { PreferencesService } from '../preferences/preferences.service';
import { Trail } from 'src/app/model/trail';
import { detectLoopType } from './path-analysis/loop-type-detection';
import { Console } from 'src/app/utils/console';
import { removeUnprobablePointsBasedOnAccuracyOnSegment, removeUnprobablePointsBasedOnBigMovesOnShortTimeOnSegment, removeUnprobablePointsOnTrack } from './path-analysis/remove-unprobable-points';
import { removeBreaksMovesOnSegment, removeBreaksMovesOnTrack } from './path-analysis/remove-breaks-moves';

@Injectable({
  providedIn: 'root'
})
export class TrackEditionService {

  constructor(
    private readonly preferencesService: PreferencesService,
  ) {}

  public applyDefaultImprovments(track: Track): Track {
    const newTrack = new Track({...track.toDto(), uuid: undefined}, this.preferencesService);
    removeUnprobablePointsOnTrack(newTrack);
    removeBreaksMovesOnTrack(newTrack);
    adjustUnprobableElevationToTrackBasedOnGrade(newTrack);
    applyElevationThresholdToTrack(newTrack, 10, 250);
    return newTrack;
  }

  public computeFinalMetadata(trail: Trail, track: Track): void {
    trail.loopType = detectLoopType(track);
  }

  public applyDefaultImprovmentsForRecordingSegment(segment: Segment, state: ImprovmentRecordingState, finish: boolean): void {
    if (!finish) Console.info('Apply partial improvment');
    removeUnprobablePointsBasedOnAccuracyOnSegment(segment, state);
    removeUnprobablePointsBasedOnBigMovesOnShortTimeOnSegment(segment, state);
    removeBreaksMovesOnSegment(segment, state);
    state.lastUnprobableElevationBasedOnGradeIndex = adjustUnprobableElevationToSegmentBasedOnGrade(segment, state.lastUnprobableElevationBasedOnGradeIndex, finish);
    if (finish)
      state.lastElevationThresholdIndex = applyElevationThresholdToSegment(segment, 10, 250, state.lastElevationThresholdIndex, segment.points.length - 1, true);
    else if (state.lastUnprobableElevationBasedOnGradeIndex)
      state.lastElevationThresholdIndex = applyElevationThresholdToSegment(segment, 10, 250, state.lastElevationThresholdIndex, state.lastUnprobableElevationBasedOnGradeIndex, false);
    if (!finish) Console.info("Partial improvment done.");
  }

}

export class ImprovmentRecordingState {

  constructor(
    public lastUnprobableElevationBasedOnGradeIndex: number | undefined = undefined,
    public lastElevationThresholdIndex: number | undefined = undefined,
    public lastRemovedPointBasedOnAccuracy: number = 0,
    public lastRemovedPointBasedOnBigMovesOnShortTime: number = 0,
    public lastBreaksMovesIndex: number = 0,
  ) {}

  public removedPoints(removedPointFrom: number, removedPointTo: number): void {
    this.lastUnprobableElevationBasedOnGradeIndex = this.computeIndexAfterRemove(this.lastUnprobableElevationBasedOnGradeIndex, removedPointFrom, removedPointTo);
    this.lastElevationThresholdIndex = this.computeIndexAfterRemove(this.lastElevationThresholdIndex, removedPointFrom, removedPointTo);
    this.lastRemovedPointBasedOnAccuracy = this.computeIndexAfterRemove(this.lastRemovedPointBasedOnAccuracy, removedPointFrom, removedPointTo) ?? 0;
    this.lastRemovedPointBasedOnBigMovesOnShortTime = this.computeIndexAfterRemove(this.lastRemovedPointBasedOnBigMovesOnShortTime, removedPointFrom, removedPointTo) ?? 0;
    this.lastBreaksMovesIndex = this.computeIndexAfterRemove(this.lastBreaksMovesIndex, removedPointFrom, removedPointTo) ?? 0;
  }

  private computeIndexAfterRemove(index: number | undefined, removedPointFrom: number, removedPointTo: number): number | undefined {
    if (index === undefined) return undefined;
    if (index < removedPointFrom) return index;
    if (index >= removedPointFrom && index <= removedPointTo) return removedPointFrom === 0 ? undefined : removedPointFrom - 1;
    return index - (removedPointTo - removedPointFrom + 1);
  }

  public toDto(): ImprovmentRecordingStateDto {
    return {
      lastUnprobableElevationBasedOnGradeIndex: this.lastUnprobableElevationBasedOnGradeIndex,
      lastElevationThresholdIndex: this.lastElevationThresholdIndex,
      lastRemovedPointBasedOnAccuracy: this.lastRemovedPointBasedOnAccuracy,
      lastRemovedPointBasedOnBigMovesOnShortTime: this.lastRemovedPointBasedOnBigMovesOnShortTime,
      lastBreaksMovesIndex: this.lastBreaksMovesIndex,
    };
  }

  public static fromDto(dto: ImprovmentRecordingStateDto): ImprovmentRecordingState {
    return new ImprovmentRecordingState(
      dto.lastUnprobableElevationBasedOnGradeIndex,
      dto.lastElevationThresholdIndex,
      dto.lastRemovedPointBasedOnAccuracy,
      dto.lastRemovedPointBasedOnBigMovesOnShortTime,
      dto.lastBreaksMovesIndex,
    );
  }

}

export interface ImprovmentRecordingStateDto {
  lastUnprobableElevationBasedOnGradeIndex: number | undefined;
  lastElevationThresholdIndex: number | undefined;
  lastRemovedPointBasedOnAccuracy: number;
  lastRemovedPointBasedOnBigMovesOnShortTime: number;
  lastBreaksMovesIndex: number;
}
