import { Injectable } from '@angular/core';
import { Track } from 'src/app/model/track';
import { applyElevationThresholdToTrack } from './elevation/elevation-threshold';

@Injectable({
  providedIn: 'root'
})
export class TrackEditionService {

  public applyDefaultImprovments(track: Track): Track {
    const newTrack = new Track({...track.toDto(), uuid: undefined});
    applyElevationThresholdToTrack(newTrack, 10);
    return newTrack;
  }

}
