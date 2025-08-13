import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { TrackEditToolContext } from '../tool.interface';
import { CommonModule } from '@angular/common';
import { IonIcon, IonButton, IonInput, IonItem, IonList, IonItemDivider } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { combineLatest, of, Subscription } from 'rxjs';
import { PointReference, RangeReference } from 'src/app/model/point-reference';

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
  @Input() small = false;

  expanded = true;
  selection?: PointReference | RangeReference;
  point1?: PointReference;
  point2?: PointReference;

  private selectionSubscription?: Subscription;

  constructor(
    public readonly i18n: I18nService,
    private readonly changesDetector: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.onCreated(this);
    this.selectionSubscription =
      combineLatest([this.context.selection.selection$, this.context.currentTrack$])
      .subscribe(([sel, track]) => {
        const selection = track && sel ? sel.find(s => s.track === track) : undefined;
        this.selection = selection;
        if (!track || !selection) {
          this.point1 = undefined;
          this.point2 = undefined;
        } else if (selection instanceof PointReference) {
          this.point1 = selection;
          this.point2 = undefined;
        } else {
          this.point1 = selection.start;
          this.point2 = selection.end;
        }
        this.changesDetector.detectChanges();
      });
  }

  ngOnDestroy(): void {
    this.context.removeTool(SelectionComponent);
    this.selectionSubscription?.unsubscribe();
  }

  // header

  toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.changesDetector.detectChanges();
  }

  close(): void {
    this.context.selection.cancelSelection();
    this.context.refreshTools();
  }

  // selection

  extendSelection(): void {
    this.context.selection.extendingSelection = true;
    this.changesDetector.detectChanges();
  }

  // navigation

  canMoveBackward(point: PointReference): boolean {
    return point.pointIndex > 0 || point.segmentIndex > 0;
  }

  moveBackward(point: PointReference): void {
    let newPoint: PointReference;
    if (point.pointIndex === 0) {
      newPoint = new PointReference(point.track, point.segmentIndex - 1, point.track.segments[point.segmentIndex].points.length - 1);
    } else {
      newPoint = new PointReference(point.track, point.segmentIndex, point.pointIndex - 1);
    }
    if (this.selection instanceof PointReference) {
      this.context.selection.selectPoint([newPoint]);
    } else if (point === this.point1) {
      this.context.selection.selectRange([new RangeReference(newPoint, this.point2!)]);
    } else if (newPoint.segmentIndex === this.point1!.segmentIndex && newPoint.pointIndex === this.point1!.pointIndex) {
      this.context.selection.selectPoint([newPoint]);
    } else {
      this.context.selection.selectRange([new RangeReference(this.point1!, newPoint)]);
    }
  }

  canMoveForward(point: PointReference): boolean {
    return point.segmentIndex < point.track.segments.length - 1 ||
      point.pointIndex < point.track.segments[point.segmentIndex].points.length - 1;
  }

  moveForward(point: PointReference): void {
    let newPoint: PointReference;
    if (point.pointIndex === point.track.segments[point.segmentIndex].points.length - 1) {
      newPoint = new PointReference(point.track, point.segmentIndex + 1, 0);
    } else {
      newPoint = new PointReference(point.track, point.segmentIndex, point.pointIndex + 1);
    }
    if (this.selection instanceof PointReference) {
      this.context.selection.selectPoint([newPoint]);
    } else if (point === this.point2) {
      this.context.selection.selectRange([new RangeReference(this.point1!, newPoint)]);
    } else if (newPoint.segmentIndex === this.point2!.segmentIndex && newPoint.pointIndex === this.point2!.pointIndex) {
      this.context.selection.selectPoint([newPoint]);
    } else {
      this.context.selection.selectRange([new RangeReference(newPoint, this.point2!)]);
    }
  }

  // elevation

  elevationInputValue(meters: number): string {
    let e = this.i18n.elevationInUserUnit(meters).toFixed(6);
    while (e.endsWith('0')) e = e.substring(0, e.length - 1);
    if (e.charAt(e.length - 1) < '0' || e.charAt(e.length - 1) > '9') e = e.substring(0, e.length - 1);
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
