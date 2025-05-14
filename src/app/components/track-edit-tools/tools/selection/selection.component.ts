import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { PointReference, PointReferenceRange, TrackEditToolContext } from '../tool.interface';
import { CommonModule } from '@angular/common';
import { IonIcon, IonButton, IonInput, IonItem, IonList, IonItemDivider } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapAnchor } from 'src/app/components/map/markers/map-anchor';
import { Track } from 'src/app/model/track';
import { of, Subscription } from 'rxjs';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';

@Component({
  templateUrl: './selection.component.html',
  styleUrl: './selection.component.scss',
  imports: [IonItemDivider, IonList, IonItem, IonInput, IonButton, IonIcon,
    CommonModule,
  ]
})
export class SelectionComponent implements OnInit, OnDestroy {

  @Input() context!: TrackEditToolContext;
  @Input() onCreated!: (instance: SelectionComponent) => void;
  @Input() vertical = true;

  expanded = true;

  point1?: PointReference;
  point2?: PointReference;

  private readonly selectedPointAnchor = new MapAnchor({lat: 0, lng: 0}, '#6060FFC0', undefined, undefined, undefined, '#6060FF80', undefined);
  private trackChangeSubscription?: Subscription;

  constructor(
    public readonly i18n: I18nService,
    private readonly prefs: PreferencesService,
    private readonly changesDetector: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.onCreated(this);
    this.trackChangeSubscription = this.context.currentTrack$.subscribe(newTrack => {
      if (!newTrack) this.close();
      else this.updateTrack(newTrack);
    });
  }

  ngOnDestroy(): void {
    this.context.removeTool(SelectionComponent);
    this.context.map?.removeFromMap(this.selectedPointAnchor.marker);
    if (this.point2)
      this.context.cancelFocus();
    this.trackChangeSubscription?.unsubscribe();
  }

  // header

  toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.changesDetector.detectChanges();
  }

  close(): void {
    this.context.removeTool(SelectionComponent);
    this.context.refreshTools();
  }

  // selection

  selectPoint(point: PointReference): void {
    if (this.selectingPoint2) {
      if (point.segmentIndex < this.point1!.segmentIndex || (point.segmentIndex === this.point1!.segmentIndex && point.pointIndex < this.point1!.pointIndex)) {
        this.point2 = this.point1;
        this.point1 = point;
      } else {
        this.point2 = point;
      }
      this.selectingPoint2 = false;
    } else if (!this.point2) {
      this.point1 = point;
    } else {
      this.point1 = point;
      this.point2 = undefined;
    }
    this.updateSelection();
  }

  selectRange(range: PointReferenceRange): void {
    this.point1 = range.start;
    this.point2 = range.end;
    this.updateSelection();
  }

  getSelection(): PointReference | PointReferenceRange | undefined {
    if (!this.point1) return undefined;
    if (!this.point2) return this.point1;
    return {
      track: this.point1.track,
      start: this.point1,
      end: this.point2,
    } as PointReferenceRange;
  }

  selectingPoint2 = false;

  extendSelection(): void {
    this.selectingPoint2 = true;
    this.changesDetector.detectChanges();
  }

  private updateSelection(): void {
    if (this.point2 && this.point2.point === this.point1!.point) {
      this.point2 = undefined;
    }
    if (this.point2) {
      this.context.map?.removeFromMap(this.selectedPointAnchor.marker);
      this.context.focusOn(this.point2.track, this.point1!.segmentIndex, this.point1!.pointIndex, this.point2.segmentIndex, this.point2.pointIndex);
    } else {
      this.selectedPointAnchor.marker.setLatLng(this.point1!.point.pos); // NOSONAR
      this.context.map?.addToMap(this.selectedPointAnchor.marker);
      this.context.cancelFocus();
    }
    this.context.refreshTools();
    this.changesDetector.detectChanges();
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

  // navigation

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

  // elevation

  elevationInputValue(meters: number): string {
    let e = this.i18n.elevationInUserUnit(meters).toFixed(6);
    while (e.at(e.length - 1) === '0') e = e.substring(0, e.length - 1);
    if (e.at(e.length - 1)! < '0' || e.at(e.length - 1)! > '9') e = e.substring(0, e.length - 1);
    return e;
  }

  setElevation(point: PointReference, ele: string | null | undefined): void {
    if (ele === null || ele === undefined) return;
    let e = parseFloat(ele);
    if (isNaN(e)) return;
    e = this.i18n.elevationInMetersFromUserUnit(e);
    this.context.modifyTrack(false, track => {
      track.segments[point.segmentIndex].points[point.pointIndex].ele = e;
      return of(true);
    }).subscribe();
  }

}
