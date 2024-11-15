import { Injectable } from '@angular/core';
import { Track } from 'src/app/model/track';
import { applyElevationThresholdToSegment, applyElevationThresholdToTrack } from './elevation/elevation-threshold';
import { Segment } from 'src/app/model/segment';
import { adjustUnprobableElevationToSegment, adjustUnprobableElevationToTrack } from './elevation/unprobable-elevation';
import { PreferencesService } from '../preferences/preferences.service';
import { Trail } from 'src/app/model/trail';
import { detectLoopType } from './path-analysis/loop-type-detection';

@Injectable({
  providedIn: 'root'
})
export class TrackEditionService {

  constructor(
    private readonly preferencesService: PreferencesService,
  ) {}

  public applyDefaultImprovments(track: Track): Track {
    const newTrack = new Track({...track.toDto(), uuid: undefined}, this.preferencesService);
    adjustUnprobableElevationToTrack(newTrack);
    applyElevationThresholdToTrack(newTrack, 10, 250);
    return newTrack;
  }

  public computeFinalMetadata(trail: Trail, track: Track): void {
    trail.loopType = detectLoopType(track);
  }

  public applyDefaultImprovmentsForRecordingSegment(segment: Segment, state: ImprovmentRecordingState | undefined, finish: boolean): ImprovmentRecordingState {
    const lastUnprobableElevationIndex = adjustUnprobableElevationToSegment(segment, state?.lastUnprobableElevationIndex, finish);
    const lastElevationThresholdIndex = applyElevationThresholdToSegment(segment, 10, 250, state?.lastElevationThresholdIndex, finish);
    return {
      lastUnprobableElevationIndex,
      lastElevationThresholdIndex,
    }
  }

}

export interface ImprovmentRecordingState {

  lastUnprobableElevationIndex: number;
  lastElevationThresholdIndex: number;

}
