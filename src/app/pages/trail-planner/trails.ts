import { BehaviorSubject, combineLatest, first, map, Observable, of, switchMap } from 'rxjs';
import { Track } from '@trailence/model/track';
import { Trail } from '@trailence/model/trail';
import { MapComponent } from '@trailence/components/map/map.component';
import { ChangeDetectorRef, Injector } from '@angular/core';
import { TrackService } from '@trailence/services/database/track.service';
import { TrailService } from '@trailence/services/database/trail.service';
import { collection$items } from '@trailence/utils/rxjs/collection$items';
import { TrailCollectionService } from '@trailence/services/database/trail-collection.service';
import { ShareService } from '@trailence/services/database/share.service';
import { TrailCollection } from '@trailence/model/trail-collection';
import { Share } from '@trailence/model/share';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { TrailCollectionType } from '@trailence/model/dto/trail-collection';
import { trackBoundsToEarthBBox, TrackMetadataSnapshot } from '@trailence/model/snapshots';
import { MapSimplifiedTracksPath } from '@trailence/components/map/elements/map-simplified-tracks-path';
import { AnyMapElement, MAP_SELECTED_TRACK_LAYER } from '@trailence/components/map/map-element';
import { bboxOverlaps, bboxPadRatio, EarthBBox, isPointInBBox } from '@trailence/utils/latlng';
import { Color } from '@trailence/utils/color';

const TRAIL_MAPTRACK_DEFAULT_COLOR = '#FF000080';
const TRAIL_MAPTRACK_HIGHLIGHTED_COLOR = '#FF00FFFF';

export class Trails {

  public showTrails = false;
  public searchingTrails = false;

  public list: {trail: Trail; track: Track; collectionName: string; meta: TrackMetadataSnapshot}[] = [];
  public highlightedTrail?: Trail;
  private readonly trailsTracks$ = new BehaviorSubject<MapSimplifiedTracksPath | undefined>(undefined);
  private readonly highlightedTrack$ = new BehaviorSubject<MapSimplifiedTracksPath | undefined>(undefined);
  public readonly mapElement$: Observable<AnyMapElement[]> = combineLatest([this.trailsTracks$, this.highlightedTrack$]).pipe(
    map(([e1, e2]) => {
      const list: AnyMapElement[] = [];
      if (e1) list.push(e1);
      if (e2) list.push(e2);
      return list;
    }),
  );

  private readonly changeDetector: ChangeDetectorRef;

  constructor(
    private readonly injector: Injector,
    private readonly getMap: () => MapComponent | undefined,
  ) {
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
    this.trailsTracks$.next(undefined);
    this.highlightedTrack$.next(undefined);
    const previouslyHighlighted = this.highlightedTrail;
    this.highlightedTrail = undefined;
    const renderer = this.getMap()?.renderer;
    if (!this.showTrails || !renderer) return;
    let bounds = renderer.getBounds();
    if (!bounds) return;
    bounds = bboxPadRatio(bounds, -0.05);
    this.searchingTrails = true;
    this.injector.get(TrackService).getAllMetadata$().pipe(
      collection$items(meta => !!meta.bounds && bboxOverlaps(bounds, trackBoundsToEarthBBox(meta.bounds))),
      first(),
      switchMap(metaList =>
        this.injector.get(TrailService).getAll$().pipe(
          collection$items(trail => metaList.some(meta => meta.uuid === trail.currentTrackUuid && meta.owner === trail.owner)),
          first(),
          switchMap(trails =>
            combineLatest([
              trails.length === 0 ? of([]) : this.injector.get(TrailCollectionService).getMyCollectionsReady$().pipe(first()),
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
      if (list.length > 0) {
        const simplified = list.map(t => ({
          trail: t.trail,
          track: {
            owner: t.trail.owner,
            uuid: t.track.uuid,
            points: t.track.getAllPositions(),
          },
        }));
        this.trailsTracks$.next(new MapSimplifiedTracksPath('trail-planner-tracks', simplified, Color.parse(TRAIL_MAPTRACK_DEFAULT_COLOR)));
        const hl = previouslyHighlighted ? list.find(e => e.trail.owner === previouslyHighlighted.owner && e.trail.uuid === previouslyHighlighted.uuid) : undefined;
        if (hl) this.toggleHighlightTrail(hl.trail);
      }
      this.changeDetector.detectChanges();
    });
  }

  private computeTrailsWithCollectionName( // NOSONAR
    collections: TrailCollection[], shares: Share[], trails: Trail[], tracks: Track[], metaList: TrackMetadataSnapshot[], bounds: EarthBBox
  ): {trail: Trail; track: Track; collectionName: string; meta: TrackMetadataSnapshot}[] {
    const result: {trail: Trail; track: Track; collectionName: string; meta: TrackMetadataSnapshot}[] = [];
    for (const track of tracks) {
      const trail = trails.find(trail => trail.currentTrackUuid === track.uuid && trail.owner === track.owner);
      if (!trail)  continue;
      const meta = metaList.find(m => m.uuid === trail.currentTrackUuid && m.owner === trail.owner);
      if (!meta) continue;
      if (!track.forEachPosition(pos => isPointInBBox(pos, bounds))) continue;
      const collection = collections.find(col => col.uuid === trail.collectionUuid && col.owner === trail.owner);
      if (collection) {
        const collectionName = collection.name.length === 0 && collection.type === TrailCollectionType.MY_TRAILS ? this.injector.get(I18nService).texts.my_trails : collection.name;
        result.push({trail, track, collectionName, meta});
      } else {
        const share = shares.find(share => share.owner === trail.owner && share.trails.includes(trail.uuid));
        if (share) {
          result.push({trail, track, collectionName: share.name, meta});
        }
      }
    }
    return result;
  }

  toggleHighlightTrail(trail: Trail): void {
    if (this.highlightedTrail === trail) {
      this.highlightedTrail = undefined;
    } else {
      this.highlightedTrail = trail;
    }
    const t = this.highlightedTrail ? this.trailsTracks$.value?.tracks?.find(trailAndTrack => trailAndTrack.trail === this.highlightedTrail) : undefined;
    if (!t) {
      if (this.highlightedTrack$.value) this.highlightedTrack$.next(undefined);
    } else if (this.highlightedTrack$.value?.tracks?.at(0)?.trail !== trail) {
      const mapElement = new MapSimplifiedTracksPath(
        'trail-planner-highlighted-track',
        [t],
        Color.parse(TRAIL_MAPTRACK_HIGHLIGHTED_COLOR),
      );
      mapElement.setPositionOnMap({layer: MAP_SELECTED_TRACK_LAYER});
      this.highlightedTrack$.next(mapElement);
    }
    this.changeDetector.detectChanges();
  }

}
