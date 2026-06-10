import { Track } from 'src/app/model/track';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { BehaviorSubjectOnDemand, BehaviorSubjectOnDemandWithSnapshot } from '../rxjs/behavior-subject-ondemand';
import { BreakPointSection, detectLongBreaksFromTrack, TrackLongBreaks } from 'src/app/services/track-edition/time/break-detection';
import { debounceTime, EMPTY, from, Observable, of, switchMap } from 'rxjs';
import { estimateTimeForTrack, TrackTimeEstimation } from 'src/app/services/track-edition/time/time-estimation';
import { TrackWayPoint } from '../track-waypoints/track-waypoint';
import { computeTrackWayPoints } from '../track-waypoints/compute-track-way-points';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';
import { WorkerService } from 'src/app/worker/web-app';
import { OsmWaysTrackPoint } from './match-osm-ways';
import { Way } from 'src/app/services/map/way';
import { TrackOsmStats } from './track-osm-stats';

export class TrackComputedData {

  constructor(
    public readonly track: Track,
    public readonly preferencesService: PreferencesService,
    public readonly mapService: OfflineMapService,
    public readonly workerService: WorkerService,
  ) {}

  private readonly _breaks = new BehaviorSubjectOnDemandWithSnapshot<TrackLongBreaks>(
    () => detectLongBreaksFromTrack(this.track, this.preferencesService.preferences.longBreakMinimumDuration, this.preferencesService.preferences.longBreakMaximumDistance),
    this.track.changes$.pipe(debounceTime(250))
  );

  private readonly _estimatedDuration = new BehaviorSubjectOnDemandWithSnapshot<TrackTimeEstimation>(
    () => estimateTimeForTrack(this.track, this.preferencesService.preferences.estimatedBaseSpeed),
    this.track.changes$.pipe(debounceTime(250))
  );

  // TODO once calculated, with a good debounceTime (or when BehaviorSubjectOnDemand is unloading), save in cache ? with the version of the track, and version of osm-data
  private readonly _osmWaysMatch = new BehaviorSubjectOnDemand<{ways: Map<string, Way>, osmTrackPoints: OsmWaysTrackPoint[][]} | undefined>(
    () => this.track.metadata.bounds ?
        this.mapService.ways.getAllWays(this.track.metadata.bounds).pipe(
          switchMap(ways => from(
            this.workerService.matchOsmWays(this.track.segments.map(s => s.points.map(p => ({lat: p.pos.lat, lng: p.pos.lng}))), ways)
            .then(osmTrackPoints => {
              const waysIds = new Set<string>();
              for (const segment of osmTrackPoints)
                for (const p of segment)
                  if (p.osmWayId) waysIds.add(p.osmWayId);
              const waysMap = new Map<string, Way>();
              for (const way of ways) if (waysIds.has(way.id)) waysMap.set(way.id, way);
              return {ways: waysMap, osmTrackPoints};
            })
          ))
        )
      : of(undefined),
    this.track.changes$.pipe(debounceTime(250)),
    120000,
  );

  private readonly _osmStats = new BehaviorSubjectOnDemand<TrackOsmStats | null>(
    () => this.osmWays$.pipe(
      switchMap(osmWays => osmWays ? this.workerService.getTrackOsmStats(osmWays.ways, osmWays.osmTrackPoints) : of(null)),
    ),
    EMPTY,
    120000,
  );

  private readonly _wayPoints = new BehaviorSubjectOnDemand<TrackWayPoint[]>(
    () => computeTrackWayPoints(this.track, this._breaks.snapshot().sections, this.mapService),
    this.track.changes$.pipe(debounceTime(250)),
    60000,
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

  public get osmWays$(): Observable<{ways: Map<string, Way>, osmTrackPoints: OsmWaysTrackPoint[][]} | undefined> {
    return this._osmWaysMatch.asObservable();
  }

  public get osmStats$(): Observable<TrackOsmStats | null> {
    return this._osmStats.asObservable();
  }

}
