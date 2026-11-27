import { Injector } from '@angular/core';
import { BehaviorSubject, first } from 'rxjs';
import { MapComponent } from '@trailence/components/map/map.component';
import { Track } from '@trailence/model/track';
import { Trail } from '@trailence/model/trail';
import { AuthService } from '@trailence/services/auth/auth.service';
import { TrackService } from '@trailence/services/database/track.service';
import { TrailService } from '@trailence/services/database/trail.service';
import { PreferencesService } from '@trailence/services/preferences/preferences.service';
import { TrackEditionService } from '@trailence/services/track-edition/track-edition.service';
import { TrailPlannerPage } from './trail-planner.page';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { TrailSourceType } from '@trailence/model/dto/trail';
import { OfflineMapService } from '@trailence/services/map/offline-map.service';
import { WorkerService } from '@trailence/worker/web-app';
import { TrackComputedDataCacheService } from '@trailence/services/database/track-computed-data-cache.service';
import { NetworkService } from '@trailence/services/network/network.service';
import { TrailCollection } from '@trailence/model/trail-collection';
import { getLogger } from '@trailence/utils/console';
import { MapTrackPath, PATH_ARROWS_DEFAULT_COLOR } from '@trailence/components/map/elements/map-track-path';
import { MapTrackAnchors } from '@trailence/components/map/elements/map-track-anchors';
import { Color } from '@trailence/utils/color';
import { filterDefined } from '@trailence/utils/rxjs/filter-defined';
import { PRIMARY_TRACK_COLOR } from '@trailence/components/trail/trail-colors';
import { AddPoints } from '@trailence/utils/track-add-points/add-points';
import { MenuItem } from '@trailence/components/menus/menu-item';

const logger = getLogger('track-builder');

const LOCALSTORAGE_KEY_PREFIX = 'trailence.trail-planner.';

export class TrackBuilder {

  public track?: Track;
  public readonly trackMapElements$ = new BehaviorSubject<[MapTrackPath, MapTrackAnchors] | undefined>(undefined);
  public estimatedTime = 0;
  public hasElevation = false;

  private map?: MapComponent;
  public addPoints?: AddPoints;

  constructor(
    private readonly injector: Injector,
    private readonly planner: TrailPlannerPage,
  ) {
  }

  setMap(map: MapComponent): void {
    this.map = map;
    map.renderer$.pipe(
      filterDefined(),
      first(),
    ).subscribe(
      () => this.loadFromLocalStorage()
    );
  }

  public getToolbarItems(): MenuItem[] {
    if (this.addPoints) return this.addPoints.toolbar;
    return [];
  }

  public canSave(): boolean {
    return !!this.addPoints && !!this.track && this.track.segments.length > 0 && this.track.lastSegment.points.length > 1;
  }

  public isActive(): boolean {
    return !!this.addPoints && (this.addPoints.putAnchors || this.addPoints.putFreeAnchor);
  }
  public isPaused(): boolean {
    return !!this.addPoints && !this.addPoints.putAnchors && !this.addPoints.putFreeAnchor;
  }

  private mapElementFromTrack(): void {
    if (!this.track) return;
    const color = Color.parse(PRIMARY_TRACK_COLOR).setAlpha(0.5);
    this.trackMapElements$.next([
      new MapTrackPath(undefined, this.track, color, false, 3, PATH_ARROWS_DEFAULT_COLOR),
      new MapTrackAnchors(this.track, this.injector.get(I18nService), false, color, undefined, undefined, undefined),
    ]);
  }

  start(map: MapComponent): AddPoints {
    this.map = map;
    this.track = new Track({owner: this.injector.get(AuthService).email}, false, this.injector.get(PreferencesService), this.injector.get(OfflineMapService), this.injector.get(WorkerService), this.injector.get(TrackComputedDataCacheService), this.injector.get(NetworkService));
    this.mapElementFromTrack();
    this.addPoints = new AddPoints(this.injector, map, this.track, [], true, 0, () => this.planner.refreshToolbar(), () => this.trackChanged(), () => this.elevationChanged());
    this.saveToLocalStorage();
    this.estimatedTime = 0;
    this.hasElevation = false;
    return this.addPoints;
  }

  stop(): void {
    this.addPoints?.stop();
  }

  resume(): void {
    this.addPoints?.resume();
  }

  reset(): void {
    this.addPoints = undefined;
    this.trackMapElements$.next(undefined);
    this.track = undefined;
    this.estimatedTime = 0;
    this.hasElevation = false;
    this.deleteFromLocalStorage();
  }

  save(collection: TrailCollection, trailName: string): Trail {
    if (!this.track) throw new Error('Unexpected');
    const user = this.track.owner;
    const track = this.track.owner !== collection.getContentOwner() ? this.track.copy(collection.getContentOwner()) : this.track;
    const trail = new Trail({
      owner: track.owner,
      collectionUuid: collection.uuid,
      name: trailName,
      originalTrackUuid: track.uuid,
      currentTrackUuid: track.uuid,
      sourceType: TrailSourceType.TRAILENCE_PLANNER,
      source: user,
      sourceDate: Date.now(),
    });
    this.injector.get(TrackEditionService).computeFinalMetadata(trail, track);
    this.injector.get(TrackService).create(track);
    this.injector.get(TrailService).create(trail);
    return trail;
  }

  private elevationChanged(): void {
    this.saveToLocalStorage();
    this.estimatedTime = this.track!.computed.timeEstimationSnapshot.total;
    this.hasElevation = this.track!.forEachPoint(p => p.ele !== undefined) ?? false;
    if (this.hasElevation)
      this.planner.updateGraph(this.track!);
    this.planner.changesDetection.detectChanges();
  }

  private trackChanged(): void {
    this.saveToLocalStorage();
    this.planner.changesDetection.detectChanges();
  }

  public mapChanged(): void {
    this.addPoints?.mapChanged();
  }

  // --- local storage ---

  private readonly STORAGE_VERSION = '1';
  private loadFromLocalStorage(): void {
    const str = localStorage.getItem(this.getLocalStorageKey());
    if (!str) return;
    try {
      const json = JSON.parse(str);
      if (!json['track'] || !json['points'] || json['STORAGE_VERSION'] !== this.STORAGE_VERSION) return;
      const points = json['points'];
      if (!Array.isArray(points)) return;
      this.track = new Track(json['track'], false, this.injector.get(PreferencesService), this.injector.get(OfflineMapService), this.injector.get(WorkerService), this.injector.get(TrackComputedDataCacheService), this.injector.get(NetworkService));
      this.hasElevation = this.track!.forEachPoint(p => p.ele !== undefined) ?? false;
      if (this.hasElevation)
        this.planner.updateGraph(this.track!);
      this.mapElementFromTrack();
      this.addPoints = new AddPoints(this.injector, this.map!, this.track, points, true, 0, () => this.planner.refreshToolbar(), () => this.trackChanged(), () => this.elevationChanged());
      this.planner.started(this.addPoints);
    } catch (e) {
      logger.warn('Error loading trail planner local storage', e, str);
    }
  }

  private saveToLocalStorage(): void {
    if (!this.track || !this.addPoints) return;
    if (this.track.segments.length === 0) {
      this.deleteFromLocalStorage();
      return;
    }
    localStorage.setItem(this.getLocalStorageKey(), JSON.stringify({
      track: this.track.toDto(),
      points: this.addPoints.trackPoints,
      STORAGE_VERSION: this.STORAGE_VERSION,
    }));
  }

  private deleteFromLocalStorage(): void {
    localStorage.removeItem(this.getLocalStorageKey());
  }

  private getLocalStorageKey(): string {
    return LOCALSTORAGE_KEY_PREFIX + this.injector.get(AuthService).email;
  }

}
