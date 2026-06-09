import { Track } from 'src/app/model/track';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { BehaviorSubjectOnDemand, BehaviorSubjectOnDemandWithSnapshot } from '../rxjs/behavior-subject-ondemand';
import { BreakPointSection, detectLongBreaksFromTrack, TrackLongBreaks } from 'src/app/services/track-edition/time/break-detection';
import { debounceTime, Observable } from 'rxjs';
import { estimateTimeForTrack, TrackTimeEstimation } from 'src/app/services/track-edition/time/time-estimation';
import { TrackWayPoint } from '../track-waypoints/track-waypoint';
import { computeTrackWayPoints } from '../track-waypoints/compute-track-way-points';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';

export class TrackComputedData {

  constructor(
    public readonly track: Track,
    public readonly preferencesService: PreferencesService,
    public readonly mapService: OfflineMapService,
  ) {}

  private readonly _breaks = new BehaviorSubjectOnDemandWithSnapshot<TrackLongBreaks>(
    () => detectLongBreaksFromTrack(this.track, this.preferencesService.preferences.longBreakMinimumDuration, this.preferencesService.preferences.longBreakMaximumDistance),
    this.track.changes$.pipe(debounceTime(250))
  );

  private readonly _estimatedDuration = new BehaviorSubjectOnDemandWithSnapshot<TrackTimeEstimation>(
    () => estimateTimeForTrack(this.track, this.preferencesService.preferences.estimatedBaseSpeed),
    this.track.changes$.pipe(debounceTime(250))
  );

  private readonly _wayPoints = new BehaviorSubjectOnDemand<TrackWayPoint[]>(
    () => computeTrackWayPoints(this.track, this._breaks.snapshot().sections, this.mapService),
    this.track.changes$.pipe(debounceTime(250))
  );

  public get breaks$(): Observable<TrackLongBreaks> {
    return this._breaks.asObservable();
  }
  public get breaksSnapshot(): TrackLongBreaks {
    return this._breaks.snapshot();
  }

  public get timeEstimation$(): Observable<TrackTimeEstimation> {
    return this._estimatedDuration.asObservable();
  }
  public get timeEstimationSnapshot(): TrackTimeEstimation {
    return this._estimatedDuration.snapshot();
  }

  public get wayPoints$(): Observable<TrackWayPoint[]> {
    return this._wayPoints.asObservable();
  }

}
