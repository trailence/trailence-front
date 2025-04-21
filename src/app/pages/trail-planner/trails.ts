import { BehaviorSubject, combineLatest, first, map, of, switchMap } from 'rxjs';
import { MapTrack } from 'src/app/components/map/track/map-track';
import { Track } from 'src/app/model/track';
import { Trail } from 'src/app/model/trail';
import { TrackMetadataSnapshot } from 'src/app/services/database/track-database';
import { TrailPlannerPage } from './trail-planner.page';
import { MapComponent } from 'src/app/components/map/map.component';
import { ChangeDetectorRef, Injector } from '@angular/core';
import { TrackService } from 'src/app/services/database/track.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { ShareService } from 'src/app/services/database/share.service';
import { TrailCollection } from 'src/app/model/trail-collection';
import { Share } from 'src/app/model/share';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrailCollectionType } from 'src/app/model/dto/trail-collection';

const TRAIL_MAPTRACK_DEFAULT_COLOR = '#FF000080';
const TRAIL_MAPTRACK_HIGHLIGHTED_COLOR = '#FF00FFFF';

export class Trails {

  public showTrails = false;
  public searchingTrails = false;

  public list: {trail: Trail; track: Track; collectionName: string; meta: TrackMetadataSnapshot}[] = [];
  public trailsMapTracks$ = new BehaviorSubject<MapTrack[]>([]);
  public highlightedTrail?: Trail;

  private readonly map: MapComponent;
  private readonly changeDetector: ChangeDetectorRef;

  constructor(
    private readonly injector: Injector,
    private readonly planner: TrailPlannerPage,
  ) {
    this.map = planner.map!;
    this.changeDetector = injector.get(ChangeDetectorRef);
  }

  public toggleShowTrails(enabled: boolean): void {
    this.showTrails = enabled;
    this.updateTrails();
  }

  public mapChanged(): void {
    this.updateTrails();
  }

  private updateTrails(): void {
    this.list = [];
    this.trailsMapTracks$.next([]);
    const previouslyHighlighted = this.highlightedTrail;
    this.highlightedTrail = undefined;
    if (!this.showTrails || !this.map.getState()) return;
    this.searchingTrails = true;
    const bounds = this.map.getBounds()!.pad(-0.05);
    this.injector.get(TrackService).getAllMetadata$().pipe(
      collection$items(meta => !!meta.bounds && bounds.overlaps(meta.bounds)),
      first(),
      switchMap(metaList =>
        this.injector.get(TrailService).getAll$().pipe(
          collection$items(trail => !!metaList.find(meta => meta.uuid === trail.currentTrackUuid && meta.owner === trail.owner)),
          first(),
          switchMap(trails =>
            combineLatest([
              trails.length === 0 ? of([]) : this.injector.get(TrailCollectionService).getAll$().pipe(collection$items(), first()),
              trails.length === 0 ? of([]) : this.injector.get(ShareService).getAll$().pipe(collection$items(), first()),
              trails.length === 0 ? of([]) : combineLatest(trails.map(trail => this.injector.get(TrackService).getFullTrackReady$(trail.currentTrackUuid, trail.owner)))
            ])
            .pipe(
              map(([collections, shares, tracks]) => this.computeTrailsWithCollectionName(collections, shares, trails, tracks, metaList, bounds))
            )
          ),
        )
      )
    ).subscribe(list => {
      this.searchingTrails = false;
      this.list = list.sort((e1, e2) => {
        const d1 = e1.track.departurePoint;
        const d2 = e2.track.departurePoint;
        if (!d1) {
          if (d2) return 1;
          return 0;
        }
        if (!d2) return -1;
        const l1 = d1.pos.lat - d2.pos.lat;
        if (l1 > 0) return -1;
        if (l1 < 0) return 1;
        const l2 = d1.pos.lng - d2.pos.lng;
        if (l2 < 0) return -1;
        if (l2 > 0) return 1;
        return 0;
      });
      this.trailsMapTracks$.next(list.map(t => new MapTrack(t.trail, t.track, TRAIL_MAPTRACK_DEFAULT_COLOR, 1, false, this.injector.get(I18nService))));
      const hl = previouslyHighlighted ? list.find(e => e.trail.owner === previouslyHighlighted.owner && e.trail.uuid === previouslyHighlighted.uuid) : undefined;
      if (hl) this.toggleHighlightTrail(hl.trail);
      this.changeDetector.detectChanges();
    });
  }

  private computeTrailsWithCollectionName( // NOSONAR
    collections: TrailCollection[], shares: Share[], trails: Trail[], tracks: Track[], metaList: TrackMetadataSnapshot[], bounds: L.LatLngBounds
  ): {trail: Trail; track: Track; collectionName: string; meta: TrackMetadataSnapshot}[] {
    const result: {trail: Trail; track: Track; collectionName: string; meta: TrackMetadataSnapshot}[] = [];
    for (const track of tracks) {
      const trail = trails.find(trail => trail.currentTrackUuid === track.uuid && trail.owner === track.owner);
      if (!trail)  continue;
      const meta = metaList.find(m => m.uuid === trail.currentTrackUuid && m.owner === trail.owner);
      if (!meta) continue;
      if (!track.forEachPosition(pos => bounds.contains(pos))) continue;
      const collection = collections.find(col => col.uuid === trail.collectionUuid && col.owner === trail.owner);
      if (collection) {
        const collectionName = collection.name.length === 0 && collection.type === TrailCollectionType.MY_TRAILS ? this.injector.get(I18nService).texts.my_trails : collection.name;
        result.push({trail, track, collectionName, meta});
      } else {
        const share = shares.find(share => share.owner === trail.owner && share.trails.indexOf(trail.uuid) >= 0);
        if (share) {
          result.push({trail, track, collectionName: share.name, meta});
        }
      }
    }
    return result;
  }

  toggleHighlightTrail(trail: Trail): void {
    let mapTrack = this.highlightedTrail ? this.trailsMapTracks$.value.find(t => t.trail === this.highlightedTrail) : undefined;
    if (mapTrack) mapTrack.color = TRAIL_MAPTRACK_DEFAULT_COLOR;
    if (this.highlightedTrail === trail) {
      this.highlightedTrail = undefined;
    } else {
      this.highlightedTrail = trail;
    }
    mapTrack = this.highlightedTrail ? this.trailsMapTracks$.value.find(t => t.trail === this.highlightedTrail) : undefined;
    if (mapTrack) {
      mapTrack.color = TRAIL_MAPTRACK_HIGHLIGHTED_COLOR;
      mapTrack.bringToFront();
    }
    this.changeDetector.detectChanges();
  }

}
