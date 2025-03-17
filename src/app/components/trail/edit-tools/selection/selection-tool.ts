import { Component, Input } from '@angular/core';
import { EditTool } from '../tool.interface';
import { EditToolsComponent } from '../edit-tools.component';
import { MapAnchor } from 'src/app/components/map/markers/map-anchor';
import { MapTrackPointReference } from 'src/app/components/map/track/map-track-point-reference';
import { ComputedWayPoint, Track } from 'src/app/model/track';
import { map, Observable, of, switchMap } from 'rxjs';
import { WayPoint } from 'src/app/model/way-point';
import { Point, samePositionRound } from 'src/app/model/point';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonIcon, IonList, IonItem, IonButton, IonInput } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { TrackUtils } from 'src/app/utils/track-utils';
import { PathRange } from '../../path-selection';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';

interface PointReference {
  track: Track;
  segmentIndex: number;
  pointIndex: number;
  point: Point;
}

@Component({
  selector: 'app-edit-tools-selection',
  templateUrl: './selection-tool.html',
  styleUrls: ['./selection-tool.scss'],
  imports: [IonIcon, IonList, IonItem, IonButton, IonInput, CommonModule]
})
export class SelectionTool implements EditTool {

  @Input() editTools!: EditToolsComponent;

  hasOwnFooter = false;

  constructor(
    public readonly i18n: I18nService,
    private readonly prefs: PreferencesService,
  ) {}

  private readonly selectedPointAnchor = new MapAnchor({lat: 0, lng: 0}, '#6060FFC0', undefined, undefined, undefined, '#6060FF80', undefined);
  point1?: PointReference;
  point2?: PointReference;

  selectingPoint2 = false;

  onMapClick(event: MapTrackPointReference[]) : void {
    if (event.length === 0) {
      this.exit();
      return;
    }
    this.editTools.getTrack().subscribe(track => {
      const points = event.filter(p => p.track.track === track && p.point !== undefined).sort(MapTrackPointReference.distanceComparator);
      const point = points.length > 0 ? points[0] : undefined;
      if (!point) {
        if (!this.selectingPoint2 && this.point1) {
          this.exit();
        }
        return;
      }
      if (this.selectingPoint2) {
        if (point.segmentIndex! < this.point1!.segmentIndex || (point.segmentIndex === this.point1!.segmentIndex && point.pointIndex! < this.point1!.pointIndex)) {
          this.point2 = this.point1;
          this.point1 = this.mapReferenceToPointReference(point);
        } else {
          this.point2 = this.mapReferenceToPointReference(point);
        }
        this.selectingPoint2 = false;
      } else if (!this.point2) {
        this.point1 = this.mapReferenceToPointReference(point);
      } else {
        this.point1 = this.mapReferenceToPointReference(point);
        this.point2 = undefined;
      }
      this.updateSelection();
    });
  }

  private mapReferenceToPointReference(point: MapTrackPointReference): PointReference {
    return {
      track: point.track.track as Track,
      segmentIndex: point.segmentIndex!,
      pointIndex: point.pointIndex!,
      point: point.point as Point,
    }
  }

  private updateSelection(): void {
    if (this.point2 && this.point2.point === this.point1!.point) {
      this.point2 = undefined;
    }
    if (this.point2) {
      this.editTools.map.removeFromMap(this.selectedPointAnchor.marker);
      this.editTools.focusOn(this.point2.track, this.point1!.segmentIndex, this.point1!.pointIndex, this.point2.segmentIndex, this.point2.pointIndex);
    } else {
      this.selectedPointAnchor.marker.setLatLng(this.point1!.point.pos); // NOSONAR
      this.editTools.map.addToMap(this.selectedPointAnchor.marker);
      this.editTools.cancelFocus();
    }
    this.editTools.changesDetector.detectChanges();
  }

  private updateTrack(newTrack: Track): void {
    if (this.point1) {
      this.point1.track = newTrack;
      this.point1.point = newTrack.segments[this.point1.segmentIndex].points[this.point1.pointIndex];
    }
    if (this.point2) {
      this.point2.track = newTrack;
      this.point2.point = newTrack.segments[this.point2.segmentIndex].points[this.point2.pointIndex];
    }
  }

  private exit(): void {
    this.editTools.map.removeFromMap(this.selectedPointAnchor.marker);
    if (this.point2)
      this.editTools.cancelFocus();
    this.editTools.setInlineTool(undefined);
  }

  extendSelection(): void {
    this.selectingPoint2 = true;
    this.editTools.changesDetector.detectChanges();
  }

  setSelection(range: PathRange): void {
    this.point1 = { track: range.track, segmentIndex: range.startSegmentIndex, pointIndex: range.startPointIndex, point: range.track.segments[range.startSegmentIndex].points[range.startPointIndex] };
    this.point2 = { track: range.track, segmentIndex: range.endSegmentIndex, pointIndex: range.endPointIndex, point: range.track.segments[range.endSegmentIndex].points[range.endPointIndex] };
    this.updateSelection();
  }

  getDistance(): number {
    const track = this.point1!.track;
    if (this.point2) {
      return TrackUtils.distanceBetweenPoints(track.segments, this.point1!.segmentIndex, this.point1!.pointIndex, this.point2.segmentIndex, this.point2.pointIndex);
    } else {
      return TrackUtils.distanceBetweenPoints(track.segments, 0, 0, this.point1!.segmentIndex, this.point1!.pointIndex);
    }
  }

  getTime(): string {
    if (!this.point1?.point.time) return '';
    if (this.point2) {
      if (!this.point2.point.time) return '';
      return this.i18n.durationToString(Math.abs(this.point2.point.time - this.point1.point.time), false, true);
    }
    return this.i18n.timestampToDateTimeString(this.point1.point.time);
  }

  elevationInputValue(meters: number): string {
    return this.i18n.elevationInUserUnit(meters).toFixed(6);
  }

  setElevation(point: PointReference, ele: string | null | undefined): void {
    if (ele === null || ele === undefined) return;
    let e = parseFloat(ele);
    if (isNaN(e)) return;
    e = this.i18n.elevationInMetersFromUserUnit(e);
    this.editTools.modify().subscribe(track => {
      track.segments[point.segmentIndex].points[point.pointIndex].ele = e;
      this.updateTrack(track);
    });
  }

  canMoveBackward(point: PointReference): boolean {
    return point.pointIndex > 0 || point.segmentIndex > 0;
  }

  moveBackward(point: PointReference): void {
    if (point.pointIndex === 0) {
      point.segmentIndex = point.segmentIndex - 1;
      point.pointIndex = point.track.segments[point.segmentIndex].points.length - 1;
      point.point = point.track.segments[point.segmentIndex].points[point.pointIndex];
    } else {
      point.pointIndex--;
      point.point = point.track.segments[point.segmentIndex].points[point.pointIndex];
    }
    this.updateSelection();
  }

  canMoveForward(point: PointReference): boolean {
    return point.segmentIndex < point.track.segments.length - 1 ||
      point.pointIndex < point.track.segments[point.segmentIndex].points.length - 1;
  }

  moveForward(point: PointReference): void {
    if (point.pointIndex === point.track.segments[point.segmentIndex].points.length - 1) {
      point.segmentIndex = point.segmentIndex + 1;
      point.pointIndex = 0;
      point.point = point.track.segments[point.segmentIndex].points[0];
    } else {
      point.pointIndex++;
      point.point = point.track.segments[point.segmentIndex].points[point.pointIndex];
    }
    this.updateSelection();
  }

  remove(): void {
    this.editTools.modify().subscribe(track => { // NOSONAR
      if (this.point1?.segmentIndex === undefined) return;
      if (this.point2?.segmentIndex === undefined) {
        const wp = this.findWayPoints(track, this.point1.segmentIndex, this.point1.pointIndex, this.point1.segmentIndex, this.point1.pointIndex);
        track.segments[this.point1.segmentIndex].removePointAt(this.point1.pointIndex);
        wp.forEach(w =>track.removeWayPoint(w));
      } else {
        const wp = this.findWayPoints(track, this.point1.segmentIndex, this.point1.pointIndex + 1, this.point2.segmentIndex, this.point2.pointIndex - 1);
        wp.forEach(w =>track.removeWayPoint(w));
        while (this.point2.segmentIndex > this.point1.segmentIndex + 1) {
          track.removeSegmentAt(this.point1.segmentIndex + 1);
          this.point2.segmentIndex--;
        }
        if (this.point2.segmentIndex > this.point1.segmentIndex) {
          let segment = track.segments[this.point1.segmentIndex];
          if (this.point1.pointIndex < segment.points.length - 1)
            segment.removeMany(segment.points.slice(this.point1.pointIndex + 1));
          segment = track.segments[this.point2.segmentIndex];
          if (this.point2.pointIndex > 0)
            segment.removeMany(segment.points.slice(0, this.point2.pointIndex));
        } else {
          const segment = track.segments[this.point1.segmentIndex];
          if (this.point2.pointIndex > this.point1.pointIndex + 1)
            segment.removeMany(segment.points.slice(this.point1.pointIndex + 1, this.point2.pointIndex));
        }
      }
      this.exit();
    });
  }

  removeAllPointsAfter(): void {
    this.editTools.modify().subscribe(track => {
      if (!this.point1) return;
      const wp = this.findWayPoints(track, this.point1.segmentIndex, this.point1.pointIndex + 1, track.segments.length - 1, track.segments[track.segments.length - 1].points.length - 1);
      wp.forEach(w =>track.removeWayPoint(w));
      while (track.segments.length > this.point1.segmentIndex + 1) track.removeSegmentAt(this.point1.segmentIndex + 1);
      const pi = this.point1.pointIndex;
      const segment = track.segments[this.point1.segmentIndex];
      if (pi < segment.points.length - 1) {
        segment.removeMany(segment.points.slice(pi + 1));
      }
      this.exit();
    });
  }

  removeAllPointsBefore(): void {
    this.editTools.modify().subscribe(track => {
      if (!this.point1) return;
      const wp = this.findWayPoints(track, 0, 0, this.point1.segmentIndex, this.point1.pointIndex - 1);
      wp.forEach(w =>track.removeWayPoint(w));
      let si = this.point1.segmentIndex;
      while (si > 0) {
        track.removeSegmentAt(0);
        si--;
      }
      const pi = this.point1.pointIndex;
      const segment = track.segments[0];
      if (pi > 0) {
        segment.removeMany(segment.points.slice(0, pi));
      }
      this.exit();
    });
  }

  getWayPointFromSelectedPoint(): Observable<{waypoint: WayPoint | undefined}> {
    if (!this.point1 || this.point2) return of({waypoint: undefined});
    return this.editTools.getTrack().pipe(
      switchMap(track => track.wayPoints$),
      map(wayPoints => {
        for (const wp of wayPoints) {
          if (wp.point.pos.lat === this.point1?.point.pos.lat && wp.point.pos.lng === this.point1?.point.pos.lng) return {waypoint: wp};
        }
        return {waypoint: undefined};
      })
    );
  }

  createWayPoint(): void {
    this.editTools.modify().subscribe(track => {
      if (!this.point1) return;
      track.appendWayPoint(new WayPoint(this.point1.point, '', ''));
      this.exit();
    });
  }

  removeWayPoint(wp: WayPoint): void {
    this.editTools.modify().subscribe(track => {
      const w = track.wayPoints.find(w => samePositionRound(w.point.pos, wp.point.pos));
      if (w) track.removeWayPoint(w);
      this.exit();
    });
  }

  findWayPoints(track: Track, startSegmentIndex: number, startPointIndex: number, endSegmentIndex: number, endPointIndex: number) {
    let computed = ComputedWayPoint.compute(track, this.prefs.preferences);
    computed = computed.filter(wp =>
      wp.nearestSegmentIndex !== undefined && wp.nearestPointIndex !== undefined &&
      this.inRange(wp.nearestSegmentIndex, wp.nearestPointIndex, startSegmentIndex, startPointIndex, endSegmentIndex, endPointIndex)
    );
    return track.wayPoints.filter(wp => computed.find(c => c.wayPoint.isEquals(wp)));
  }

  private inRange(segmentIndex: number, pointIndex: number, startSegmentIndex: number, startPointIndex: number, endSegmentIndex: number, endPointIndex: number): boolean {
    if (segmentIndex < startSegmentIndex || segmentIndex > endSegmentIndex) return false;
    if (segmentIndex === startSegmentIndex && pointIndex < startPointIndex) return false;
    if (segmentIndex === endSegmentIndex && pointIndex > endPointIndex) return false;
    return true;
  }

}
