import { Injectable } from '@angular/core';
import { Track } from 'src/app/model/track';
import { applyElevationThresholdToSegment, applyElevationThresholdToTrack } from './elevation/elevation-threshold';
import { Segment } from 'src/app/model/segment';
import { adjustUnprobableElevationToSegmentBasedOnGrade, adjustUnprobableElevationToTrackBasedOnGrade } from './elevation/unprobable-elevation-with-grade';
import { PreferencesService } from '../preferences/preferences.service';
import { Trail } from 'src/app/model/trail';
import { detectLoopType } from './path-analysis/loop-type-detection';
import { Console } from 'src/app/utils/console';

@Injectable({
  providedIn: 'root'
})
export class TrackEditionService {

  constructor(
    private readonly preferencesService: PreferencesService,
  ) {}

  public applyDefaultImprovments(track: Track): Track {
    const newTrack = new Track({...track.toDto(), uuid: undefined}, this.preferencesService);
    adjustUnprobableElevationToTrackBasedOnGrade(newTrack);
    applyElevationThresholdToTrack(newTrack, 10, 250);
    return newTrack;
  }

  public computeFinalMetadata(trail: Trail, track: Track): void {
    trail.loopType = detectLoopType(track);
  }

  public applyDefaultImprovmentsForRecordingSegment(segment: Segment, state: ImprovmentRecordingState | undefined, finish: boolean): ImprovmentRecordingState {
    if (!finish) Console.info("Partial improvment: adjust unprobable elevation based on grade");
    const lastUnprobableElevationBasedOnGradeIndex = adjustUnprobableElevationToSegmentBasedOnGrade(segment, state?.lastUnprobableElevationBasedOnGradeIndex, finish);
    if (!finish) Console.info("Partial improvment: apply elevation threshold");
    let lastElevationThresholdIndex: number | undefined;
    if (finish)
      lastElevationThresholdIndex = applyElevationThresholdToSegment(segment, 10, 250, state?.lastElevationThresholdIndex, segment.points.length - 1, true);
    else if (lastUnprobableElevationBasedOnGradeIndex)
      lastElevationThresholdIndex = applyElevationThresholdToSegment(segment, 10, 250, state?.lastElevationThresholdIndex, lastUnprobableElevationBasedOnGradeIndex, false);
    else
      lastElevationThresholdIndex = state?.lastElevationThresholdIndex;
    if (!finish) Console.info("Partial improvment done.");
    return {
      lastUnprobableElevationBasedOnGradeIndex,
      lastElevationThresholdIndex,
    }
  }

  public updateImprovmentState(state: ImprovmentRecordingState | undefined, removedPointFrom: number, removedPointTo: number): ImprovmentRecordingState | undefined {
    if (state === undefined || removedPointFrom === 0) return undefined;
    return {
      lastUnprobableElevationBasedOnGradeIndex: removedPointFrom <= state.lastUnprobableElevationBasedOnGradeIndex ? removedPointFrom - 1 : state.lastUnprobableElevationBasedOnGradeIndex,
      lastElevationThresholdIndex: state.lastElevationThresholdIndex === undefined ? undefined : (removedPointFrom <= state.lastElevationThresholdIndex ? removedPointFrom - 1 : state.lastElevationThresholdIndex),
    }
  }

}

export interface ImprovmentRecordingState {

  lastUnprobableElevationBasedOnGradeIndex: number;
  lastElevationThresholdIndex: number | undefined;

}
