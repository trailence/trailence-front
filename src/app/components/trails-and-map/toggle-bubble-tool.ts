import { BehaviorSubject, combineLatest, EMPTY, from, map, Observable, of, switchMap } from 'rxjs';
import { MapTool } from '../map/map-tool';
import { AnyMapElement } from '../map/map-element';
import { Trail } from '@trailence/model/trail';
import { MapBubble } from '../map/elements/map-bubble';
import { Injector } from '@angular/core';
import { MapComponent } from '../map/map.component';
import { MenuItem } from '../menus/menu-item';
import { observableWithCache } from '@trailence/utils/rxjs/observable-with-cache';
import { CollectionObservableCache } from '@trailence/utils/rxjs/collection-cache';
import { TrailService } from '@trailence/services/database/trail.service';
import { SimplifiedTrackSnapshot, trackBoundsToEarthBBox, TrackMetadataSnapshot } from '@trailence/model/snapshots';
import { filterDefined } from '@trailence/utils/rxjs/filter-defined';
import { getLogger } from '@trailence/utils/console';
import { PRIMARY_TRACK_COLOR } from '../trail/trail-colors';
import { Color } from '@trailence/utils/color';
import { MapElementsToolGroup } from '../map/tools/map-elements-tools';
import { debounceTimeExtended } from '@trailence/utils/rxjs/debounce-time-extended';
import { defaultOnTimeout } from '@trailence/utils/rxjs/default-on-timeout';
import { MapSimplifiedTracksPath, TrailAndSimplifiedTrack } from '../map/elements/map-simplified-tracks-path';

const logger = getLogger('trails-and-map');

const TRACK_COLOR = Color.parse(PRIMARY_TRACK_COLOR);

export class ToggleBubblesTool implements MapTool {

  readonly group = MapElementsToolGroup.id;
  readonly order = -1000;

  constructor(
    private readonly injector: Injector,
    private readonly trails$: Observable<Trail[]>,
    private readonly bubbles$: Observable<MapBubble[]>,
    private readonly map$: Observable<MapComponent | undefined>,
  ) {}

  private readonly activable$ = new BehaviorSubject<boolean>(false);
  private readonly showBubbles$ = new BehaviorSubject<boolean>(false);
  private _hasBubbles = false;

  getMapElements$(): Observable<AnyMapElement[]> {
    const trailService = this.injector.get(TrailService);
    return observableWithCache<AnyMapElement[], Cache>(
      () => ({
        trailToTrackUuid: new CollectionObservableCache<Trail, {trail: Trail, trackUuid: string}>(
          trail => trail.currentTrackUuid$.pipe(map(trackUuid => ({trail, trackUuid})))
        ),
        trailToSimplifiedTrack: new CollectionObservableCache<{trail: Trail, trackUuid: string}, {trail: Trail, track: SimplifiedTrackSnapshot | null}>(
          t => trailService.getSimplifiedTrack$(t.trail, t.trackUuid).pipe(
            filterDefined(),
            map(track => ({trail: t.trail, track})),
            defaultOnTimeout(1000, () => {
              logger.warn('Simplified track not found after 1s for trail', t.trail.owner, t.trail.uuid, t.trackUuid);
              return {trail: t.trail, track: null};
            }),
          ),
          (t1, t2) => t1.trackUuid === t2.trackUuid && t1.trail.owner === t2.trail.owner,
        ),
        trailToTrackMetadata: new CollectionObservableCache<{trail: Trail, trackUuid: string}, {trail: Trail, track: TrackMetadataSnapshot | null}>(
          t => trailService.getTrackMetadata$(t.trail, t.trackUuid).pipe(
            filterDefined(),
            map(track => ({trail: t.trail, track})),
            defaultOnTimeout(1000, () => {
              logger.warn('Track metadata not found after 1s for trail', t.trail.owner, t.trail.uuid, t.trackUuid);
              return {trail: t.trail, track: null};
            }),
          ),
          (t1, t2) => t1.trackUuid === t2.trackUuid && t1.trail.owner === t2.trail.owner,
        ),
      }),
      cache => {
        cache.trailToTrackUuid.destroy();
        cache.trailToSimplifiedTrack.destroy();
        cache.trailToTrackMetadata.destroy();
      },
      cache => combineLatest([
        this.trails$,
        this.bubbles$,
        this.showBubbles$,
      ]).pipe(
        switchMap(([trails, bubbles, showBubbles]) => {
          if (bubbles.length > 0) {
            this._hasBubbles = true;
            // we have bubbles, this is the priority except if explicitely toggled by the user
            if (trails.length === 0 || !this.userSelectedTrailsExplicitely || showBubbles) {
              // bubbles
              this.userSelectedTrailsExplicitely = false;
              this.setActivable(trails.length > 0);
              if (!showBubbles) {
                this.showBubbles$.next(true);
                return EMPTY;
              }
              return of(bubbles);
            }
          } else {
            this._hasBubbles = false;
          }
          if (trails.length === 0) {
            // nothing
            this.setActivable(false);
            if (showBubbles) this.showBubbles$.next(false);
            return of([]);
          }
          // trails
          this.setActivable(true);
          if (showBubbles) {
            if (!this.userSelectedBubblesExplicitely) {
              this.showBubbles$.next(false);
              return EMPTY;
            }
            return cache.trailToTrackUuid.combineLatest(trails).pipe(
              switchMap(trails => cache.trailToTrackMetadata.combineLatest(trails)),
              debounceTimeExtended(0, 10),
              switchMap(tracks => this.buildBubblesFromTracks(tracks)),
            );
          }
          return cache.trailToTrackUuid.combineLatest(trails).pipe(
            switchMap(trails => cache.trailToSimplifiedTrack.combineLatest(trails)),
            debounceTimeExtended(0, 10),
            map(tracks => [new MapSimplifiedTracksPath('tracks', tracks.filter(t => !!t.track) as TrailAndSimplifiedTrack[], TRACK_COLOR, 2)]),
          );
        }),
      )
    );
  }

  private setActivable(activable: boolean): void {
    if (this.activable$.value !== activable)
      this.activable$.next(activable);
  }

  private buildBubblesFromTracks(tracks: {trail: Trail, track: TrackMetadataSnapshot | null}[]): Observable<MapBubble[]> {
    const bounds = tracks.map(t => t.track?.bounds).filter(b => !!b).map(b => trackBoundsToEarthBBox(b));
    return combineLatest([
      this.map$.pipe(
        filterDefined(),
        switchMap(m => m.renderer$),
        filterDefined(),
        switchMap(renderer => renderer.mapState.zoom$),
        debounceTimeExtended(0, 100),
      ),
      from(import('./track-bounds-to-bubble')),
    ]).pipe(
      map(([zoom, module]) => module.buildBubblesFromBoundsAndZoom(bounds, zoom)),
    );
  }

  createMenuItem$(injector: Injector, mapComponent: MapComponent): Observable<MenuItem> {
    const item = new MenuItem()
      .setAction(() => {
        // explicit user choice
        const newChoice = !this.showBubbles$.value;
        if (this._hasBubbles) {
          this.userSelectedTrailsExplicitely = !newChoice;
        } else {
          this.userSelectedBubblesExplicitely = newChoice;
        }
        this.showBubbles$.next(newChoice);
        this.saveState();
      });
    return this.activable$.pipe(
      switchMap(activable => {
        if (!activable) {
          item.setVisible(false);
          return of(item);
        }
        return this.showBubbles$.pipe(
          map(isBubbles => {
            item.setVisible(true);
            item.setIcon(isBubbles ? 'path' : 'bubbles');
            return item;
          })
        );
      })
    );
  }

  private _userSelectedTrailsExplicitely = false;
  private _userSelectedBubblesExplicitely = false;
  private _storageKey?: string;

  private get userSelectedTrailsExplicitely(): boolean { return this._userSelectedTrailsExplicitely; }
  private set userSelectedTrailsExplicitely(value: boolean) {
    if (this._userSelectedTrailsExplicitely === value) return;
    this._userSelectedTrailsExplicitely = value;
  }

  private get userSelectedBubblesExplicitely(): boolean { return this._userSelectedBubblesExplicitely; }
  private set userSelectedBubblesExplicitely(value: boolean) {
    if (this._userSelectedBubblesExplicitely === value) return;
    this._userSelectedBubblesExplicitely = value;
  }

  public setStateKey(key: string | undefined): void {
    this._storageKey = key;
    if (key) {
      const stateString = localStorage.getItem(key);
      let trails = false;
      let bubbles = false;
      if (stateString) {
        try {
          const json = JSON.parse(stateString);
          if (typeof json === 'boolean') {
            bubbles = json; // TODO backward compatible, before 3.0.0 it was showBubbles
          } else {
            trails = !!json['trails'];
            bubbles = !!json['bubbles'];
          }
        } catch (e) { // NOSONAR
          // ignore
        }
      }
      this._userSelectedTrailsExplicitely = trails;
      this._userSelectedBubblesExplicitely = bubbles;
      if (this.showBubbles$.value !== bubbles) this.showBubbles$.next(bubbles);
    }
  }

  private saveState(): void {
    if (!this._storageKey) return;
    localStorage.setItem(this._storageKey, JSON.stringify({trails: this._userSelectedTrailsExplicitely, bubbles: this._userSelectedBubblesExplicitely}));
  }

}

interface Cache {
  trailToTrackUuid: CollectionObservableCache<Trail, {trail: Trail, trackUuid: string}>;
  trailToSimplifiedTrack: CollectionObservableCache<{trail: Trail, trackUuid: string}, {trail: Trail, track: SimplifiedTrackSnapshot | null}>;
  trailToTrackMetadata: CollectionObservableCache<{trail: Trail, trackUuid: string}, {trail: Trail, track: TrackMetadataSnapshot | null}>;
}
