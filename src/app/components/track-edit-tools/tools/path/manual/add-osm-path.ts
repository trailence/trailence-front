import { combineLatest, distinctUntilChanged, map, of, Subscription, switchMap } from 'rxjs';
import { TrackEditToolContext } from '../../tool.interface';
import { AddPointsContext, AddPointsTool } from './add-points-tool';
import { Way } from 'src/app/services/geolocation/way';
import * as L from 'leaflet';
import { GeoService } from 'src/app/services/geolocation/geo.service';
import { WayUtils } from 'src/app/services/geolocation/way-utils';
import { MapTrack } from 'src/app/components/map/track/map-track';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapTrackPointReference } from 'src/app/components/map/track/map-track-point-reference';
import { Arrays } from 'src/app/utils/arrays';
import { PointDescriptor } from 'src/app/model/point-descriptor';

const MIN_ZOOM = 14;
const MATCHING_MAX_DISTANCE = 2.5;

const DEFAULT_COLOR = '#A030D0';
const HIGHLIGHTED_COLOR = '#D080FF';

export class AddOsmPath extends AddPointsTool {

  override labelKey(ctx: TrackEditToolContext): string {
    return 'add_points.osm.title';
  }

  private waysSubscription?: Subscription;
  private anchorMapOverSubscription?: Subscription;
  private anchorMapClickSubscription?: Subscription;

  private allWays: Way[] = [];
  private allMapTracks: MapTrack[] = [];
  private possibleWays: WayAndMapTrack[] = [];
  private possibleWaysFromCursor: WayAndMapTrack[] = [];

  private init(ctx: AddPointsContext): void {
    for (const w of this.possibleWays) ctx.map.removeTrack(w.mapTrack);
    for (const w of this.possibleWaysFromCursor) ctx.map.removeTrack(w.mapTrack);
    this.possibleWaysFromCursor = [];
    if (this.allWays.length === 0) {
      this.possibleWays = [];
      this.anchor.marker.remove();
      return;
    }
    const matching = WayUtils.getMatchingWays(ctx.point.pos, this.allWays, MATCHING_MAX_DISTANCE);
    this.possibleWays = (matching.length > 0 ? matching : this.allWays).map(way => ({
      way,
      mapTrack: this.allMapTracks.find(mt => mt.data === way)!,
    }));
    for (const w of this.possibleWays) w.mapTrack.addTo(ctx.map.getMap()!); // NOSONAR
  }

  override enableAddPoints(ctx: AddPointsContext): void {
    if (this.waysSubscription === undefined) {
      this.waysSubscription = combineLatest([ctx.map.getState().center$, ctx.map.getState().zoom$]).pipe(
        distinctUntilChanged(),
        switchMap(([center, zoom]) => zoom < MIN_ZOOM ? of([]) : ctx.injector.get(GeoService).findWays(ctx.map.getBounds()!)), // NOSONAR
        map(ways => WayUtils.mergeWays(ways)),
      ).subscribe(ways => {
        this.allWays = ways;
        this.allMapTracks = ways.map(way => {
          const mapTrack = new MapTrack(
            undefined,
            {
              points: way.points
            },
            DEFAULT_COLOR,
            1, false, ctx.injector.get(I18nService)
          );
          mapTrack.data = way;
          return mapTrack;
        });
        this.init(ctx);
      });
    } else {
      this.init(ctx);
    }

    this.anchorMapOverSubscription = ctx.map.mouseOverPoint.subscribe(refs => {
      if (ctx.map.getState().zoom < MIN_ZOOM) {
        return;
      }
      const ref = this.getEligiblePoint(ctx.point.pos, refs);
      for (const mt of this.allMapTracks) mt.color = DEFAULT_COLOR;
      for (const w of this.possibleWaysFromCursor) w.mapTrack.remove();
      this.possibleWaysFromCursor = [];
      if (ref?.ref?.point) {
        const pos = ref.ref.position!;
        this.anchor.marker.setLatLng(pos);
        ctx.map.addToMap(this.anchor.marker);

        const matchingWays = WayUtils.getMatchingWays(pos, this.allWays);
        const matchingMapTracks = this.getMatchingIn(pos, [...this.possibleWays, ...this.possibleWaysFromCursor]);
        const missingWays = matchingWays.filter(way => !matchingMapTracks.some(mt => mt.way === way));
        // new possible ways from cursor = matchingMapTracks present in current possible ways + missingWays
        const newPossibleWaysFromCursor = this.possibleWaysFromCursor.filter(t => matchingMapTracks.some(t2 => t == t2));
        for (const missing of missingWays)
          newPossibleWaysFromCursor.push({way: missing, mapTrack: this.allMapTracks.find(mt => mt.data === missing)!});
        // map tracks = current - current additional + new additional
        this.possibleWaysFromCursor = newPossibleWaysFromCursor;
        for (const w of this.possibleWaysFromCursor) {
          w.mapTrack.color = HIGHLIGHTED_COLOR;
          w.mapTrack.addTo(ctx.map.getMap()!); // NOSONAR
        };
      } else {
        this.anchor.marker.remove();
      }
    });
    this.anchorMapClickSubscription = ctx.map.mouseClickPoint.subscribe(refs => {
      if (ctx.map.getState().zoom < MIN_ZOOM) {
        return;
      }
      const ref = this.getEligiblePoint(ctx.point.pos, refs);
      if (!ref?.ref?.point) return;
      const points = this.getPoints(ctx.point.pos, ref.ref.position!, ref.using!.way.points, ctx.isForward); // NOSONAR
      if (points) ctx.addPoints(points);
    });
  }

  override disableAddPoints(stop: boolean): void {
    this.anchor.marker.remove();
    this.anchorMapOverSubscription?.unsubscribe();
    this.anchorMapOverSubscription = undefined;
    this.anchorMapClickSubscription?.unsubscribe();
    this.anchorMapClickSubscription = undefined;
    if (stop) {
      this.waysSubscription?.unsubscribe();
      this.waysSubscription = undefined;
    }
    for (const mt of this.allMapTracks) mt.remove();
  }

  private getEligiblePoint(fromPos: L.LatLngLiteral, refs: MapTrackPointReference[]): {ref: MapTrackPointReference | undefined, using: WayAndMapTrack | undefined} | undefined {
    if (refs.length === 0) return undefined;
    const linkToPrevious = refs.filter(r => r.point !== undefined && this.possibleWays.some(w => w.mapTrack === r.track)).sort(MapTrackPointReference.distanceComparator);
    let best: {ref: MapTrackPointReference, using: WayAndMapTrack | undefined} | undefined = undefined;
    let bestWays: Way[] = [];
    for (const ref of linkToPrevious) {
      const matching = this.getMatchingIn(ref.position!, this.possibleWays); // NOSONAR
      if (matching.length === 1) {
        const ways = WayUtils.getMatchingWays(ref.position!, this.allWays, MATCHING_MAX_DISTANCE); // NOSONAR
        if (best === undefined || (ways.length > bestWays.length && Arrays.containsAll(ways, bestWays))) {
          best = {ref, using: matching[0]};
          bestWays = ways;
        }
      }
    }
    return best;
  }

  private getMatchingIn(pos: L.LatLngLiteral, ways: WayAndMapTrack[]): WayAndMapTrack[] {
    const matching = WayUtils.getMatchingWays(pos, ways.map(w => w.way));
    return matching.map(w => ways.find(wm => wm.way === w)!);
  }

  private getPoints(from: L.LatLngLiteral, to: L.LatLngLiteral, way: L.LatLngLiteral[], isForward: boolean): PointDescriptor[] | undefined { // NOSONAR
    const toIndex = way.findIndex(p => p.lat === to.lat && p.lng === to.lng);
    if (toIndex < 0) return undefined;
    const f = L.latLng(from);
    let bestD = f.distanceTo(to);
    let bestIndex = toIndex;
    for (let i = 0; i < way.length; ++i) {
      if (i === toIndex) continue;
      const d = f.distanceTo(way[i]);
      if (d < bestD) {
        bestD = d;
        bestIndex = i;
      }
    }
    if (bestIndex === toIndex) {
      // single point
      return [{pos: way[bestIndex]}];
    }
    const points: PointDescriptor[] = [];
    if (way[bestIndex].lat === from.lat && way[bestIndex].lng === from.lng) {
      // exactly the starting point
      if (bestIndex > toIndex) {
        if (isForward) {
          for (let i = bestIndex - 1; i >= toIndex; --i) points.push({pos:way[i]});
        } else {
          for (let i = toIndex; i < bestIndex; ++i) points.push({pos: way[i]});
        }
      } else if (isForward) {
        for (let i = bestIndex + 1; i <= toIndex; ++i) points.push({pos: way[i]});
      } else {
        for (let i = toIndex; i > bestIndex; --i) points.push({pos: way[i]});
      }
      return points;
    }
    // we should not go through the starting point
    const previousPoint = bestIndex > toIndex ? way[bestIndex - 1] : way[bestIndex + 1];
    const justBefore = {...way[bestIndex]};
    if (previousPoint.lat < justBefore.lat) justBefore.lat -= 0.0000000001; else justBefore.lat += 0.0000000001;
    if (previousPoint.lng < justBefore.lng) justBefore.lng -= 0.0000000001; else justBefore.lng += 0.0000000001;
    if (f.distanceTo(justBefore) < f.distanceTo(way[bestIndex])) {
      if (bestIndex > toIndex) bestIndex--;
      else bestIndex++;
    }

    if (bestIndex > toIndex) {
    if (isForward) {
        for (let i = bestIndex; i >= toIndex; --i) points.push({pos:way[i]});
      } else {
        for (let i = toIndex; i <= bestIndex; ++i) points.push({pos: way[i]});
      }
    } else if (isForward) {
      for (let i = bestIndex; i <= toIndex; ++i) points.push({pos: way[i]});
    } else {
      for (let i = toIndex; i >= bestIndex; --i) points.push({pos: way[i]});
    }
    return points;
  }

}

interface WayAndMapTrack {
  way: Way;
  mapTrack: MapTrack;
}
