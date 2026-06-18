import { ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output } from '@angular/core';
import { TrailsWaypoints, TrailWaypoints } from '../trail-waypoints';
import { Subscription } from 'rxjs';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonCheckbox, IonSegment, IonSegmentButton, ModalController, AlertController } from '@ionic/angular/standalone';
import { TrackEditToolsComponent } from '../../track-edit-tools/track-edit-tools.component';
import { ChangesDetection } from 'src/app/utils/angular-helpers';
import { NgClass } from '@angular/common';
import { TrackWayPoint } from 'src/app/utils/track-waypoints/track-waypoint';
import { WayPointComponent } from './waypoint.component';
import { WayPointFromTrack } from 'src/app/utils/track-waypoints/waypoints-from-track';

@Component({
  selector: 'app-trail-waypoints',
  templateUrl: './waypoints.component.html',
  styleUrl: './waypoints.component.scss',
  imports: [
    IonCheckbox, IonSegment, IonSegmentButton,
    NgClass,
    WayPointComponent,
  ]
})
export class WaypointsComponent implements OnInit, OnDestroy {

  @Input() trails!: TrailsWaypoints;
  @Input() editTools?: TrackEditToolsComponent;
  @Input() lang?: string;
  @Input() showSource = false;

  @Output() highlightWaypoint = new EventEmitter<{wp: TrackWayPoint, click: boolean}>();
  @Output() unhighlightWaypoint = new EventEmitter<{wp: TrackWayPoint, force: boolean}>();

  selectedTrailIndex = 0;
  selectedTrail?: TrailWaypoints;

  private readonly changesDetection: ChangesDetection;

  constructor(
    public readonly i18n: I18nService,
    changesDetector: ChangeDetectorRef,
    ngZone: NgZone,
    private readonly modalController: ModalController,
    private readonly alertController: AlertController,
  ) {
    this.changesDetection = new ChangesDetection(ngZone, changesDetector);
  }

  private subscription?: Subscription;

  ngOnInit(): void {
    this.subscription = this.trails.changes$.subscribe(() => {
      if (this.trails.trails.length === 0) this.selectedTrail = undefined;
      else if (this.selectedTrail) {
        this.selectedTrailIndex = this.trails.trails.indexOf(this.selectedTrail);
        if (this.selectedTrailIndex < 0) {
          this.selectedTrail = this.trails.trails[0];
          this.selectedTrailIndex = 0;
        }
      } else {
        this.selectedTrail = this.trails.trails[0];
        this.selectedTrailIndex = 0;
      }
      this.changesDetection.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  enterWaypoint(wp: TrackWayPoint): void {
    this.highlightWaypoint.emit({wp, click: false})
  }

  leaveWaypoint(wp: TrackWayPoint): void {
    this.unhighlightWaypoint.emit({wp, force: false});
  }

  toogleHighlightWayPoint(wp: TrackWayPoint | undefined): void {
    if (!wp) return;
    if (this.trails.highlightedWayPoint === wp && this.trails.highlightedWayPointFromClick) this.unhighlightWaypoint.emit({wp, force: true});
    else this.highlightWaypoint.emit({wp, click: true});
  }

  toggleShowBreaks(trail: TrailWaypoints, checked: boolean): void {
    trail.showBreaks = checked;
    this.changesDetection.detectChanges();
  }

  toggleShowGuideposts(trail: TrailWaypoints, checked: boolean): void {
    trail.showGuideposts = checked;
    this.changesDetection.detectChanges();
  }

  toggleShowIntersections(trail: TrailWaypoints, checked: boolean): void {
    trail.showIntersections = checked;
    this.changesDetection.detectChanges();
  }

  setTab(index: any): void {
    if (typeof index === 'number' && index >= 0 && index < this.trails.trails.length && index !== this.selectedTrailIndex) {
      this.selectedTrailIndex = index;
      this.selectedTrail = this.trails.trails[index];
      this.changesDetection.detectChanges();
    }
  }

  removeWaypoint(wp: WayPointFromTrack): void {
    if (this.editTools) {
      this.editTools.removeWayPoint(wp.wayPoint);
    } else {
      this.alertController.create({
        header: this.i18n.texts.track_edit_tools.tools.way_points.remove_waypoint,
        message: this.i18n.texts.track_edit_tools.tools.way_points.remove_waypoint_confirmation,
        buttons: [
          {
            text: this.i18n.texts.buttons.confirm,
            role: 'danger',
            handler: () => {
              this.alertController.dismiss();
              this.selectedTrail?.track.removeWayPoint(wp.wayPoint);
            }
          }, {
            text: this.i18n.texts.buttons.cancel,
            role: 'cancel'
          }
        ]
      }).then(a => a.present());
    }
  }

  editWaypoint(wp: WayPointFromTrack): void {
    if (this.editTools) {
      this.editTools.editWayPoint(wp.wayPoint);
    } else {
      import('../../track-edit-tools/tools/way-points/way-point-edit/way-point-edit.component')
      .then(module => this.modalController.create({
        component: module.WayPointEditModal,
        componentProps: {
          wayPoint: wp.wayPoint,
          isNew: false,
        }
      }))
      .then(modal => {
        modal.onDidDismiss().then(result => {
          if (result.role === 'ok' && wp.isComputedOnly) {
            this.selectedTrail?.track.appendWayPoint(wp.wayPoint);
          }
          this.changesDetection.detectChanges();
        });
        modal.present();
      });
    }
  }

}
