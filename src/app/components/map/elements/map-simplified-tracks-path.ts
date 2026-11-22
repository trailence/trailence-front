import { MAP_TRACKS_LAYER, MapElement } from '../map-element';
import { SimplifiedTrackSnapshot } from '@trailence/model/snapshots';
import { Trail } from '@trailence/model/trail';
import { BehaviorSubject, map, Observable, of } from 'rxjs';
import { MapRenderer } from '../impl/map-renderer';
import { Color } from '@trailence/utils/color';
import { Polyline } from '../primitives/polyline';
import { EarthBBox, extendBBox } from '@trailence/utils/latlng';
import { MapPrimitive } from '../primitives/primitive';
import { CachedValue } from '@trailence/utils/cached-value';

export type TrailAndSimplifiedTrack = {trail?: Trail, track: SimplifiedTrackSnapshot};

export class MapSimplifiedTracksPath extends MapElement<null> {

  constructor(
    id: string,
    tracks: TrailAndSimplifiedTrack[],
    color: Color,
    weight: number = 3,
  ) {
    super(id, {layer: MAP_TRACKS_LAYER});
    this._color = color;
    this._weight = weight;
    this._tracks = new BehaviorSubject(tracks);
  }

  private readonly _tracks: BehaviorSubject<TrailAndSimplifiedTrack[]>;
  private _color: Color;
  private _weight: number;
  private _polyline: Polyline<any, any> | undefined;

  public get tracks() { return this._tracks.value; }
  public set tracks(value: TrailAndSimplifiedTrack[]) {
    this._boundsCache.invalidate();
    const keysToRemove: SimplifiedTrackSnapshot[] = [];
    for (const key of this._trackBoundsCache.keys()) {
      if (!value.some(t => t.track === key)) keysToRemove.push(key);
    }
    for (const key of keysToRemove) this._trackBoundsCache.delete(key);
    this._tracks.next(value);
  }

  public get color(): Color { return this._color; }
  public set color(value: Color) {
    if (Color.areSame(value, this._color)) return;
    this._color = value;
    if (this._polyline) {
      this._polyline.setOptions({
        color: value,
        width: this._weight
      });
    }
  }

  public get weight(): number { return this._weight; }
  public set weight(value: number) {
    if (value === this._weight) return;
    this._weight = value;
    if (this._polyline) {
      this._polyline.setOptions({
        color: this._color,
        width: this._weight
      });
    }
  }

  public get fitBounds$(): Observable<EarthBBox | undefined> {
    return new Observable(subscriber => {
      subscriber.next(this._boundsCache.get());
      subscriber.complete();
    });
  }
  private readonly _boundsCache = new CachedValue<EarthBBox | undefined>(
    () => {
      let bounds: EarthBBox | undefined;
      for (const trailAndTrack of this._tracks.value) {
        const b = this.getSimplifiedTrackBounds(trailAndTrack.track);
        if (b) {
          if (!bounds) bounds = b;
          else bounds = extendBBox(bounds, b);
        }
      }
      return bounds;
    }
  );
  private readonly _trackBoundsCache = new Map<SimplifiedTrackSnapshot, CachedValue<EarthBBox | undefined>>();
  public getSimplifiedTrackBounds(track: SimplifiedTrackSnapshot): EarthBBox | undefined {
    let cache = this._trackBoundsCache.get(track);
    if (!cache) {
      cache = new CachedValue<EarthBBox | undefined>(
        () => {
          let minlat, maxlat, minlng, maxlng;
          for (const pt of track.points) {
            if (minlat === undefined || pt.lat < minlat) minlat = pt.lat;
            if (maxlat === undefined || pt.lat > maxlat) maxlat = pt.lat;
            if (minlng === undefined || pt.lng < minlng) minlng = pt.lng;
            if (maxlng === undefined || pt.lng > maxlng) maxlng = pt.lng;
          }
          if (minlat === undefined) return undefined;
          return {minlat, maxlat: maxlat!, minlng: minlng!, maxlng: maxlng!};
        }
      );
      this._trackBoundsCache.set(track, cache);
    }
    return cache.get();
  }

  public override destroy(): void {
    this._polyline = undefined;
  }

  protected override createPrimitives$(renderer: MapRenderer): Observable<{primitive: MapPrimitive<any,any,any>, eventBinding: undefined}[]> {
    return this._tracks.pipe(
      map(tracks => {
        if (this._polyline?.getRenderer() === renderer) {
          this._polyline.setPositions(tracks.map(t => t.track.points));
        } else {
          this._polyline = renderer.createPolyline(
            this.id,
            tracks.map(t => t.track.points),
            {
              color: this._color,
              width: this._weight,
            }
          );
        }
        return [{primitive: this._polyline, eventBinding: undefined}];
      }),
    );
  }

}
