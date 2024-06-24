import { BehaviorSubject } from 'rxjs';
import { ElevationGraphRange } from '../elevation-graph/elevation-graph-events';
import { MapTrack } from '../map/track/map-track';
import { TrailComponent } from './trail.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { ChangeDetectorRef, ElementRef, Injector } from '@angular/core';
import { Track } from 'src/app/model/track';

export class TrailPathSelection {

  constructor(
    private component: TrailComponent,
    private injector: Injector,
  ) {}

  mapTracks$ = new BehaviorSubject<MapTrack[]>([]);
  zoomOnSelection = false;
  selection: Track[] = [];

  elevationGraphSelecting($event: ElevationGraphRange[] | undefined): void {
    this.selection = [];
    this.setSelectionFromElevationGraph($event, 'rgba(64,64,240,0.75)');
  }

  elevationGraphSelection($event: ElevationGraphRange[] | undefined): void {
    if (this.zoomOnSelection) return;
    this.selection = this.setSelectionFromElevationGraph($event, 'rgba(0,0,255,1)');
    this.zoomOnSelection = false;
    this.injector.get(ChangeDetectorRef).detectChanges();
  }

  private setSelectionFromElevationGraph($event: ElevationGraphRange[] | undefined, color: string): Track[] {
    for (const mt of this.mapTracks$.value) {
      this.component.map?.removeTrack(mt);
    }
    const subTracks: Track[] = [];
    const newTracks: MapTrack[] = [];
    if ($event) {
      for (const range of $event) {
        const subTrack = range.track.subTrack(range.start.segmentIndex, range.start.pointIndex, range.end.segmentIndex, range.end.pointIndex);
        subTracks.push(subTrack);
        newTracks.push(new MapTrack(undefined, subTrack, color, 1, false, this.injector.get(I18nService)));
      }
    }
    for (const mt of newTracks) {
      this.component.map?.addTrack(mt);
      mt.bringToFront();
    }
    this.mapTracks$.next(newTracks);
    return subTracks;
  }

  toggleZoom(): void {
    if (!this.zoomOnSelection) {
      this.zoomOnSelection = true;
      this.component.map?.fitBounds(this.mapTracks$.value);
    } else {
      this.zoomOnSelection = false;
      this.component.map?.fitBounds(undefined);
    }
    setTimeout(() => this.injector.get(ChangeDetectorRef).detectChanges(), 0);
  }

}
