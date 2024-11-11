import { BehaviorSubject } from 'rxjs';
import { ElevationGraphRange } from '../elevation-graph/elevation-graph-events';
import { MapTrack } from '../map/track/map-track';
import { TrailComponent } from './trail.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { ChangeDetectorRef, Injector } from '@angular/core';
import { Track } from 'src/app/model/track';

export interface PathRange {
  track: Track;
  startSegmentIndex: number;
  startPointIndex: number;
  endSegmentIndex: number;
  endPointIndex: number;
}

export class TrailPathSelection {

  constructor(
    private readonly component: TrailComponent,
    private readonly injector: Injector,
  ) {}

  mapTracks$ = new BehaviorSubject<MapTrack[]>([]);
  zoomOnSelection = false;
  selection: Track[] = [];
  selectionRange: PathRange[] = [];

  elevationGraphSelecting($event: ElevationGraphRange[] | undefined): void {
    this.setSelectionFromElevationGraph($event, 'rgba(64,64,240,0.75)', false);
  }

  elevationGraphSelected($event: ElevationGraphRange[] | undefined): void {
    if (this.zoomOnSelection) return;
    this.setSelectionFromElevationGraph($event, 'rgba(0,0,255,1)', true);
    this.zoomOnSelection = false;
    this.injector.get(ChangeDetectorRef).detectChanges();
  }

  private setSelectionFromElevationGraph($event: ElevationGraphRange[] | undefined, color: string, setSelection: boolean): void {
    this.selection = [];
    this.selectionRange = [];
    for (const mt of this.mapTracks$.value) {
      this.component.map?.removeTrack(mt);
    }
    const subTracks: Track[] = [];
    const newTracks: MapTrack[] = [];
    const ranges: PathRange[] = [];
    if ($event) {
      for (const range of $event) {
        const subTrack = range.track.subTrack(range.start.segmentIndex, range.start.pointIndex, range.end.segmentIndex, range.end.pointIndex);
        subTracks.push(subTrack);
        newTracks.push(new MapTrack(undefined, subTrack, color, 1, false, this.injector.get(I18nService)));
        ranges.push({track: range.track, startSegmentIndex: range.start.segmentIndex, startPointIndex: range.start.pointIndex, endSegmentIndex: range.end.segmentIndex, endPointIndex: range.end.pointIndex});
      }
    }
    for (const mt of newTracks) {
      this.component.map?.addTrack(mt);
      mt.bringToFront();
    }
    this.mapTracks$.next(newTracks);
    if (setSelection) {
      this.selection = subTracks;
      this.selectionRange = ranges;
    }
  }

  toggleZoom(): void {
    if (!this.zoomOnSelection) {
      this.zoomOnSelection = true;
      this.component.map?.fitBounds(this.mapTracks$.value);
    } else {
      this.zoomOnSelection = false;
      this.component.map?.fitBounds(undefined);
    }
    setTimeout(() => {
      this.injector.get(ChangeDetectorRef).detectChanges();
      if (!this.zoomOnSelection && this.selectionRange.length > 0) {
        setTimeout(() => {
          this.component.elevationGraph?.setSelection(this.selectionRange);
        }, 0);
      }
    }, 0);
  }

  updatedTracks(tracks: Track[]): void {
    if (this.selection.length === 0) return;
    let mapTracksChanged = false;
    for (let i = 0; i < this.selectionRange.length; ++i) {
      const range = this.selectionRange[i];
      if (tracks.indexOf(range.track) < 0) {
        this.selectionRange.splice(i, 1);
        const subTrack = this.selection[i];
        this.selection.splice(i, 1);
        const mapIndex = this.mapTracks$.value.findIndex(mt => mt.track === subTrack);
        if (mapIndex >= 0) {
          const mt = this.mapTracks$.value[i];
          this.component.map?.removeTrack(mt);
          this.mapTracks$.value.splice(mapIndex, 1);
          mapTracksChanged = true;
        }
        i--;
      } else {
        const subTrack = range.track.subTrack(range.startSegmentIndex, range.startPointIndex, range.endSegmentIndex, range.endPointIndex);
        const previous = this.selection[i];
        if (this.changed(subTrack, previous)) {
          this.selection[i] = subTrack;
          const mapIndex = this.mapTracks$.value.findIndex(mt => mt.track === previous);
          if (mapIndex >= 0) {
            const mt = this.mapTracks$.value[i];
            this.component.map?.removeTrack(mt);
            const newMapTrack = new MapTrack(undefined, subTrack, mt.color, 1, false, this.injector.get(I18nService));
            this.mapTracks$.value.splice(mapIndex, 1, newMapTrack);
            mapTracksChanged = true;
          }
        }
      }
    }
    if (this.selection.length === 0 && this.zoomOnSelection) this.zoomOnSelection = false;
    if (mapTracksChanged) this.mapTracks$.next(this.mapTracks$.value);
  }

  private changed(track1: Track, track2: Track): boolean {
    if (track1.segments.length !== track2.segments.length) return true;
    for (let i = 0; i < track1.segments.length; ++i) {
      const s1 = track1.segments[i];
      const s2 = track2.segments[i];
      if (s1.points.length !== s2.points.length) return true;
      for (let j = 0; j < s1.points.length; ++j) {
        const p1 = s1.points[j];
        const p2 = s2.points[j];
        if (p1.pos.lat !== p2.pos.lat || p1.pos.lng !== p2.pos.lng || p1.ele !== p2.ele) return true;
      }
    }
    return false;
  }

}
