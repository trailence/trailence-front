import { BehaviorSubject, combineLatest, of, Subscription, switchMap } from 'rxjs';
import { PointReference, RangeReference } from 'src/app/model/point-reference';
import { Track } from 'src/app/model/track';
import { MapComponent } from '../map/map.component';
import { TrailGraphComponent } from '../trail-graph/trail-graph.component';
import { MapTrackPointReference } from '../map/track/map-track-point-reference';
import { GraphPointReference, GraphRange } from '../trail-graph/graph-events';
import { MapAnchor } from '../map/markers/map-anchor';

export class TrailSelection {

  public readonly selection$ = new BehaviorSubject<PointReference[] | RangeReference[] | undefined>(undefined);
  public readonly selectionTrack$ = new BehaviorSubject<Track[]>([]);
  public readonly zoom$ = new BehaviorSubject<boolean>(false);
  public extendingSelection = false;

  constructor(
    public readonly map$: BehaviorSubject<MapComponent | undefined>,
    public readonly graph$: BehaviorSubject<TrailGraphComponent | undefined>,
  ) {
    this._mapClickSubscription = map$.pipe(
      switchMap(map => map?.mouseClickPoint ?? of(undefined))
    ).subscribe(click => this.mapClick(click));
    this._elevationGraphClickSubscription = graph$.pipe(
      switchMap(graph => graph?.pointClick ?? of(undefined))
    ).subscribe(click => this.graphClick(click));
    this._elevationGraphSelectedSubscription = graph$.pipe(
      switchMap(graph => graph?.selected ?? of(undefined))
    ).subscribe(range => this.graphRange(range));
    this._mapAnchorSubscription = combineLatest([map$, this.selection$])
    .subscribe(([map, sel]) => {
      if (!map) return;
      if (sel && sel.length > 0 && (sel[0] instanceof PointReference)) {
        this.selectedPointAnchor.marker.setLatLng(sel[0].point.pos);
        map.addToMap(this.selectedPointAnchor.marker);
      } else {
        map.removeFromMap(this.selectedPointAnchor.marker);
      }
    })
  }

  private readonly selectedPointAnchor = new MapAnchor({lat: 0, lng: 0}, '#6060FFC0', undefined, undefined, undefined, '#6060FF80', undefined);

  private readonly _mapClickSubscription: Subscription;
  private readonly _elevationGraphClickSubscription: Subscription;
  private readonly _elevationGraphSelectedSubscription: Subscription;
  private readonly _mapAnchorSubscription: Subscription;

  public destroy(): void {
    this._mapClickSubscription.unsubscribe();
    this._elevationGraphClickSubscription.unsubscribe();
    this._elevationGraphSelectedSubscription.unsubscribe();
    this._mapAnchorSubscription.unsubscribe();
  }

  public selectPoint(points: PointReference[]): void {
    if (points.length === 0) {
      this.cancelSelection();
      return;
    }
    if (this.extendingSelection && this.selection$.value && this.selection$.value.length > 0 && this.selection$.value[0] instanceof PointReference) {
      const ranges: RangeReference[] = [];
      for (const point2 of points) {
        const point1 = this.selection$.value.find(p => p.track === point2.track) as PointReference | undefined;
        if (!point1) continue;
        if (point2.segmentIndex !== point1.segmentIndex || point2.pointIndex !== point1.pointIndex) {
          if (point2.segmentIndex < point1.segmentIndex || (point2.segmentIndex === point1.segmentIndex && point2.pointIndex < point1.pointIndex)) {
            ranges.push(new RangeReference(point2, point1));
          } else {
            ranges.push(new RangeReference(point1, point2));
          }
        }
      }
      if (ranges.length > 0) {
        this.extendingSelection = false;
        this.selectRange(ranges);
        return;
      }
    }
    this.selection$.next(points);
    if (this.selectionTrack$.value.length > 0)
      this.selectionTrack$.next([]);
  }

  public selectRange(ranges: RangeReference[]): void {
    if (ranges.length === 0) {
      this.cancelSelection();
      return;
    }
    this.selection$.next(ranges);
    const tracks: Track[] = [];
    for (const range of ranges) {
      tracks.push(range.createSubTrack());
    }
    this.selectionTrack$.next(tracks);
    this.cancelZoom();
  }

  public cancelSelection(): void {
    this.extendingSelection = false;
    if (this.selection$.value !== undefined) this.selection$.next(undefined);
    if (this.selectionTrack$.value.length > 0) this.selectionTrack$.next([]);
    this.cancelZoom();
  }

  public reduceRangeToStartPoint(): void {
    const sel = this.selection$.value;
    if (!sel || sel.length === 0 || !(sel[0] instanceof RangeReference)) return;
    this.selectPoint(sel.map(s => (s as RangeReference).start));
  }

  public addPoint(point: PointReference): void {
    const sel = this.selection$.value;
    const points: PointReference[] = [];
    if (sel && sel.length > 0) {
      if (sel[0] instanceof PointReference) {
        points.push(...(sel as PointReference[]));
      } else {
        return;
      }
    }
    points.push(point);
    this.selectPoint(points);
  }

  public addRange(range: RangeReference): void {
    const sel = this.selection$.value;
    const ranges: RangeReference[] = [];
    if (sel && sel.length > 0) {
      if (sel[0] instanceof RangeReference) {
        ranges.push(...(sel as RangeReference[]));
      } else {
        return;
      }
    }
    ranges.push(range);
    this.selectRange(ranges);
  }

  public removeSelectionForTrack(track: Track): void {
    const sel = this.selection$.value;
    if (!sel || sel.length === 0) return;
    let changed = false;
    for (let i = 0; i < sel.length; ++i) {
      if (sel[i].track === track) {
        sel.splice(i, 1);
        if (this.selectionTrack$.value.length > i) this.selectionTrack$.value.splice(i, 1);
        changed = true;
        i--;
      }
    }
    if (changed) {
      this.selection$.next(sel);
      this.selectionTrack$.next(this.selectionTrack$.value);
    }
  }


  public zoom(): void {
    if (!this.zoom$.value && this.selectionTrack$.value.length > 0) this.zoom$.next(true);
  }

  public cancelZoom(): void {
    if (this.zoom$.value) this.zoom$.next(false);
  }

  public toggleZoom(): void {
    if (!this.zoom$.value) this.zoom(); else this.cancelZoom();
  }

  public tracksChanged(newTracks: Track[]): void {
    if (this.selection$.value) {
      let changed = false;
      for (let i = 0; i < this.selection$.value.length; ++i) {
        const sel = this.selection$.value[i];
        if (newTracks.indexOf(sel.track) < 0) {
          this.selection$.value.splice(i, 1);
          if (this.selectionTrack$.value.length > i)
            this.selectionTrack$.value.splice(i, 1);
          i--;
          changed = true;
        }
      }
      if (changed) {
        this.selection$.next(this.selection$.value);
        this.selectionTrack$.next(this.selectionTrack$.value);
      }
    }
  }

  public hasSelection(): boolean {
    return !!this.selection$.value && this.selection$.value.length > 0;
  }

  public isRange(): boolean {
    const sel = this.selection$.value;
    return !!sel && sel.length > 0 && (sel[0] instanceof RangeReference);
  }

  public getRanges(): RangeReference[] | undefined {
    const sel = this.selection$.value;
    if (!sel || sel.length === 0 || !(sel[0] instanceof RangeReference)) return undefined;
    return sel as RangeReference[];
  }

  public getSubTrackOf(originalTrack: Track): {subTrack: Track, range: RangeReference} | undefined {
    const subTracks = this.selectionTrack$.value;
    if (subTracks.length === 0) return undefined;
    const sel = this.selection$.value;
    if (!sel) return undefined;
    for (let i = 0; i < sel.length; ++i) {
      if (sel[i].track === originalTrack) {
        if (subTracks.length > i && sel[i] instanceof RangeReference) return {subTrack: subTracks[i], range: sel[i] as RangeReference};
      }
    }
    return undefined;
  }

  public isSinglePoint(): boolean {
    const sel = this.selection$.value;
    return !!sel && sel.length > 0 && (sel[0] instanceof PointReference);
  }

  public getSinglePointOf(track: Track): PointReference | undefined {
    const sel = this.selection$.value;
    if (!sel || sel.length === 0 || !(sel[0] instanceof PointReference)) return undefined;
    for (const p of sel) if (p.track === track) return p as PointReference;
    return undefined;
  }

  public getSelectionForTrack(track: Track): PointReference | RangeReference | undefined {
    const sel = this.selection$.value;
    if (!sel) return undefined;
    return sel.find(s => s.track === track);
  }

  public getRangeOf(track: Track): RangeReference | undefined {
    const sel = this.selection$.value;
    if (!sel || sel.length === 0 || !(sel[0] instanceof RangeReference)) return undefined;
    for (const s of sel) if (s.track === track) return s as RangeReference;
    return undefined;
  }


  private mapClick(event: MapTrackPointReference[] | undefined): void {
    if (event) event = event.filter(e => !e.track.ignoreCursorHover);
    if (!event || event.length === 0) {
      this.cancelSelection();
      return;
    }
    const mapPoints = event.filter(p => p.point !== undefined).sort(MapTrackPointReference.distanceComparator);
    const points = mapPoints
      .filter(p => p.track.track instanceof Track && p.segmentIndex !== undefined && p.pointIndex !== undefined)
      .map(p => new PointReference(p.track.track as Track, p.segmentIndex!, p.pointIndex!));
    const newSelection: PointReference[] = [];
    for (const p of points) {
      const e = newSelection.find(s => s.track === p.track);
      if (!e) newSelection.push(p);
    }
    this.selectPoint(newSelection);
  }

  private graphClick(event: GraphPointReference[] | undefined): void {
    if (!event || event.length === 0) {
      this.cancelSelection();
      return;
    }
    const points = event.map(p => new PointReference(p.track, p.segmentIndex, p.pointIndex));
    this.selectPoint(points);
  }

  private graphRange(event: GraphRange[] | undefined): void {
    if (!event || event.length === 0) {
      return;
    }
    this.cancelSelection();
    const ranges = event.map(r => new RangeReference(
      new PointReference(r.track, r.start.segmentIndex, r.start.pointIndex),
      new PointReference(r.track, r.end.segmentIndex, r.end.pointIndex)
    ));
    this.selectRange(ranges);
  }

}
