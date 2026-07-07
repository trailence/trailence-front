import { Track } from 'src/app/model/track';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { BehaviorSubjectOnDemand, BehaviorSubjectOnDemandWithSnapshot } from '../rxjs/behavior-subject-ondemand';
import { detectLongBreaksFromTrack, TrackLongBreaks } from 'src/app/services/track-edition/time/break-detection';
import { concat, debounceTime, filter, from, map, Observable, of, switchMap } from 'rxjs';
import { estimateTimeForTrack, TrackTimeEstimation } from 'src/app/services/track-edition/time/time-estimation';
import { TrackWayPoint } from '../track-waypoints/track-waypoint';
import { computeTrackWayPoints } from '../track-waypoints/compute-track-way-points';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';
import { WorkerService } from 'src/app/worker/web-app';
import { OsmWaysTrackPoint } from './match-osm-ways';
import { Way } from 'src/app/services/map/way';
import { TrackOsmStats } from './track-osm-stats';
import { debounceTimeExtended } from '../rxjs/debounce-time-extended';
import { NetworkService } from 'src/app/services/network/network.service';
import { AllWaysItem, OsmStatsItem, OsmWaysMatchItem, TrackComputedDataCacheService } from 'src/app/services/database/track-computed-data-cache.service';
import { AllWaysResponse } from 'src/app/services/map/ways';
import { PoisResponse } from 'src/app/services/map/pois';
import { GUIDEPOST_MAX_DISTANCE_FROM_EXISTING_WAYPOINT } from '../track-waypoints/guideposts';
import { extendsAround } from '../leaflet-utils';
import { filterDefined } from '../rxjs/filter-defined';

export class TrackComputedData {

  constructor(
    public readonly track: Track,
    public readonly preferencesService: PreferencesService,
    public readonly mapService: OfflineMapService,
    public readonly workerService: WorkerService,
    public readonly cacheService: TrackComputedDataCacheService,
    public readonly networkService: NetworkService,
  ) {
    this._osmWays.onNewValue$.pipe(
      map(value => ({value, trackVersion: this.track.version, isRecording: this.track.isRecording})),
      debounceTime(30000),
      filter(data => !data.isRecording && !!data.value?.osmDataVersion),
    ).subscribe(data => {
      if (data.trackVersion === this.track.version) cacheService.setAllWays(track, data.value!);
    });
    this._guideposts.onNewValue$.pipe(
      map(value => ({value, trackVersion: this.track.version, isRecording: this.track.isRecording})),
      debounceTime(30000),
      filter(data => !data.isRecording && !!data.value?.osmDataVersion),
    ).subscribe(data => {
      if (data.trackVersion === this.track.version) cacheService.setGuideposts(track, data.value!);
    });
    this._osmWaysMatch.onNewValue$.pipe(
      map(value => ({value, trackVersion: this.track.version, isRecording: this.track.isRecording})),
      debounceTime(30000),
      filter(data => !data.isRecording && !data.value?.partial && !!data.value?.osmDataVersion)
    ).subscribe(data => {
      if (data.trackVersion === this.track.version) cacheService.setOsmWaysMatch(track, data.value!);
    });
    this._osmStats.onNewValue$.pipe(
      map(value => ({value, trackVersion: this.track.version, isRecording: this.track.isRecording})),
      debounceTime(30000),
      filter(data => !data.isRecording && !data.value?.isPartial && !!data.value?.osmDataVersion)
    ).subscribe(data => {
      if (data.trackVersion === this.track.version) cacheService.setOsmStats(track, data.value!);
    });
  }

  private readonly _breaks = new BehaviorSubjectOnDemandWithSnapshot<TrackLongBreaks>(
    () => detectLongBreaksFromTrack(this.track, this.preferencesService.preferences.longBreakMinimumDuration, this.preferencesService.preferences.longBreakMaximumDistance),
    this.track.changes$.pipe(this.track.isRecording ? debounceTimeExtended(0, 5000, 25) : debounceTime(250)),
  );

  private readonly _estimatedDuration = new BehaviorSubjectOnDemandWithSnapshot<TrackTimeEstimation>(
    () => estimateTimeForTrack(this.track, this.preferencesService.preferences.estimatedBaseSpeed),
    this.track.changes$.pipe(this.track.isRecording ? debounceTimeExtended(0, 5000, 25) : debounceTime(250)),
  );

  private readonly _guideposts = new BehaviorSubjectOnDemand<PoisResponse | null, string>(
    event => {
      const bounds = this.track.metadata.bounds;
      if (event || !bounds) this.cacheService.removeGuideposts(this.track);
      if (!bounds) return of(null);
      return (event ? of(undefined) : this.cacheService.getGuideposts(this.track)).pipe(
        switchMap(fromCache => {
          const server = this.networkService.server;
          if (fromCache && server && fromCache.osmDataVersion === server.osmDataVersions[this.mapService.geoDataVersion])
            return of({pois: fromCache.pois, partial: false, done: true, osmDataVersion: fromCache.osmDataVersion});
          return this.mapService.pois.getPois(extendsAround(bounds, GUIDEPOST_MAX_DISTANCE_FROM_EXISTING_WAYPOINT + 1), ['guidepost']).pipe(filter(p => p.done));
        })
      );
    },
    this.track.changes$.pipe(this.track.isRecording ? debounceTimeExtended(0, 5000, 25) : debounceTime(250)),
    120000,
  );

  private readonly _osmWays = new BehaviorSubjectOnDemand<AllWaysResponse | null, string>(
    event => {
      const bounds = this.track.metadata.bounds;
      if (event || !bounds) this.cacheService.removeAllWays(this.track);
      if (!bounds) return of(null);
      const checkFromCache: (fromCache: AllWaysItem | undefined) => Observable<AllWaysResponse> = fromCache => {
          const server = this.networkService.server;
          if (fromCache && server && fromCache.osmDataVersion === server.osmDataVersions[this.mapService.geoDataVersion])
            return of({ways: fromCache.ways, partial: false, osmDataVersion: fromCache.osmDataVersion});
          if (fromCache && !server)
            return concat(
              of({ways: fromCache.ways, partial: false, osmDataVersion: fromCache.osmDataVersion}),
              this.networkService.server$.pipe(
                filterDefined(),
                switchMap(() => this.cacheService.getAllWays(this.track)),
                switchMap(fromCache2 => checkFromCache(fromCache2)),
              )
            );
          return this.mapService.ways.getAllWays(bounds, true);
      }
      return (event ? of(undefined) : this.cacheService.getAllWays(this.track)).pipe(
        switchMap(fromCache => checkFromCache(fromCache))
      );
    },
    this.track.changes$.pipe(this.track.isRecording ? debounceTimeExtended(0, 5000, 25) : debounceTime(250)),
    150000,
  );

  private readonly _osmWaysMatch = new BehaviorSubjectOnDemand<OsmWayMatchResponse | null, string>(
    event => {
      const bounds = this.track.metadata.bounds;
      if (event || !bounds) this.cacheService.removeOsmWaysMatch(this.track);
      if (!bounds) return of(null);
      const checkFromCache: (fromCache: OsmWaysMatchItem | undefined) => Observable<OsmWayMatchResponse | null> = fromCache => {
        const server = this.networkService.server;
        if (fromCache && server && fromCache.osmDataVersion === server.osmDataVersions[this.mapService.geoDataVersion]) {
          const waysOnTrack = new Map<string, Way>();
          for (const way of fromCache.waysOnTrack) waysOnTrack.set(way.id, way);
          return of({waysOnTrack, osmTrackPoints: fromCache.osmTrackPoints, partial: false, osmDataVersion: fromCache.osmDataVersion})
        }
        if (fromCache && !server) {
          const waysOnTrack = new Map<string, Way>();
          for (const way of fromCache.waysOnTrack) waysOnTrack.set(way.id, way);
          return concat(
            of({waysOnTrack, osmTrackPoints: fromCache.osmTrackPoints, partial: false, osmDataVersion: fromCache.osmDataVersion}),
            this.networkService.server$.pipe(
              filterDefined(),
              switchMap(() => this.cacheService.getOsmWaysMatch(this.track)),
              switchMap(fromCache2 => checkFromCache(fromCache2)),
            )
          );
        }
        return (event ? of(undefined as AllWaysResponse | undefined | null) : this.osmWaysOnTrackBounds$).pipe(
          switchMap(allWays => {
            if (!allWays || allWays.ways.length === 0) return of(null);
            return from(
              this.workerService.matchOsmWays(this.track.segments.map(s => s.points.map(p => ({lat: p.pos.lat, lng: p.pos.lng}))), allWays.ways)
              .then(osmTrackPoints => {
                const waysIds = new Set<string>();
                for (const segment of osmTrackPoints)
                  for (const p of segment)
                    if (p.osm) waysIds.add(p.osm.wayId);
                const waysOnTrack = new Map<string, Way>();
                for (const way of allWays.ways) {
                  if (waysIds.has(way.id)) waysOnTrack.set(way.id, way);
                }
                return {waysOnTrack, osmTrackPoints, partial: allWays.partial, osmDataVersion: allWays.osmDataVersion};
              })
            );
          })
        );
      };
      return (event ? of(undefined) : this.cacheService.getOsmWaysMatch(this.track)).pipe(
        switchMap(fromCache => checkFromCache(fromCache)),
      );
    },
    this.track.changes$.pipe(this.track.isRecording ? debounceTimeExtended(0, 5000, 25) : debounceTime(250)),
    120000,
  );

  private readonly _osmStats = new BehaviorSubjectOnDemand<TrackOsmStats | null, string>(
    event => {
      const bounds = this.track.metadata.bounds;
      if (event || !bounds) this.cacheService.removeOsmStats(this.track);
      if (!bounds) return of(null);
      const checkFromCache: (fromCache: OsmStatsItem | undefined) => Observable<TrackOsmStats | null> = fromCache => {
        const server = this.networkService.server;
        if (fromCache && server && fromCache.osmDataVersion === server.osmDataVersions[this.mapService.geoDataVersion])
          return of({
            isPartial: false,
            osmDataVersion: fromCache.osmDataVersion,
            osmTotalDistanceMeters: fromCache.osmTotalDistanceMeters,
            wayType: fromCache.wayType,
            surface: fromCache.surface,
            hikingDifficulty: fromCache.hikingDifficulty,
            visibility: fromCache.visibility,
          });
        if (fromCache && !server)
          return concat(
            of({
              isPartial: false,
              osmDataVersion: fromCache.osmDataVersion,
              osmTotalDistanceMeters: fromCache.osmTotalDistanceMeters,
              wayType: fromCache.wayType,
              surface: fromCache.surface,
              hikingDifficulty: fromCache.hikingDifficulty,
              visibility: fromCache.visibility,
            }),
            this.networkService.server$.pipe(
              filterDefined(),
              switchMap(() => this.cacheService.getOsmStats(this.track)),
              switchMap(fromCache2 => checkFromCache(fromCache2)),
            )
          );
        return this.osmWaysMatch$.pipe(
          switchMap(osmWays => osmWays ? this.workerService.getTrackOsmStats(osmWays.waysOnTrack, osmWays.osmTrackPoints, osmWays.partial, osmWays.osmDataVersion) : of(null)),
        );
      };
      return (event ? of(undefined) : this.cacheService.getOsmStats(this.track)).pipe(
        switchMap(fromCache => checkFromCache(fromCache))
      );
    },
    this.track.changes$.pipe(this.track.isRecording ? debounceTimeExtended(0, 5000, 25) : debounceTime(250)),
    120000,
  );

  private readonly _wayPoints = new BehaviorSubjectOnDemand<TrackWayPoint[], string>(
    () => computeTrackWayPoints(this.track, this._breaks.snapshot().sections),
    this.track.changes$.pipe(this.track.isRecording ? debounceTimeExtended(0, 5000, 25) : debounceTime(250)),
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

  public get osmWaysOnTrackBounds$(): Observable<AllWaysResponse | null> {
    return this._osmWays.asObservable();
  }

  public get osmWaysMatch$(): Observable<OsmWayMatchResponse | null> {
    return this._osmWaysMatch.asObservable();
  }

  public osmWaysMatchPrependWithUndefined$(): Observable<OsmWayMatchResponse | null | undefined> {
    return this._osmWaysMatch.asObservablePrependWithUndefined();
  }

  public get osmStats$(): Observable<TrackOsmStats | null> {
    return this._osmStats.asObservable();
  }

  public get guidpostsOnTrackBounds$(): Observable<PoisResponse | null> {
    return this._guideposts.asObservable();
  }

}

export interface OsmWayMatchResponse {
  waysOnTrack: Map<string, Way>,
  osmTrackPoints: OsmWaysTrackPoint[][],
  partial: boolean,
  osmDataVersion: number | undefined,
}
