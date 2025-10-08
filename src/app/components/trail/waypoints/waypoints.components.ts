import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { TrailsWaypoints, TrailWaypoints } from '../trail-waypoints';
import { Subscription } from 'rxjs';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TextComponent } from '../../text/text.component';
import { IonButton, IonIcon, IonCheckbox, IonSegment, IonSegmentButton } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { ComputedWayPoint } from 'src/app/model/track';
import { TrackEditToolsComponent } from '../../track-edit-tools/track-edit-tools.component';

@Component({
  selector: 'app-trail-waypoints',
  templateUrl: './waypoints.components.html',
  styleUrl: './waypoints.components.scss',
  imports: [
    CommonModule,
    IonButton, IonIcon, IonCheckbox, IonSegment, IonSegmentButton,
    TextComponent,
  ]
})
export class WaypointsComponent implements OnInit, OnDestroy {

  @Input() trails!: TrailsWaypoints;
  @Input() lang?: string;
  @Input() editTools?: TrackEditToolsComponent;

  @Output() highlightWaypoint = new EventEmitter<{wp: ComputedWayPoint, click: boolean}>();
  @Output() unhighlightWaypoint = new EventEmitter<{wp: ComputedWayPoint, force: boolean}>();

  selectedTrailIndex = 0;
  selectedTrail?: TrailWaypoints;

  constructor(
    public readonly i18n: I18nService,
    private readonly changesDetector: ChangeDetectorRef,
  ) {}

  private subscription?: Subscription;

  ngOnInit(): void {
    this.subscription = this.trails.changes$.subscribe(() => {
      if (this.trails.trails.length === 0) this.selectedTrail = undefined;
      else if (!this.selectedTrail) {
        this.selectedTrail = this.trails.trails[0];
        this.selectedTrailIndex = 0;
      } else {
        this.selectedTrailIndex = this.trails.trails.indexOf(this.selectedTrail);
        if (this.selectedTrailIndex < 0) {
          this.selectedTrail = this.trails.trails[0];
          this.selectedTrailIndex = 0;
        }
      }
      this.changesDetector.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  toogleHighlightWayPoint(wp: ComputedWayPoint): void {
    if (this.trails.highlightedWayPoint === wp && this.trails.highlightedWayPointFromClick) this.unhighlightWaypoint.emit({wp, force: true});
    else this.highlightWaypoint.emit({wp, click: true});
  }

  setTab(index: any): void {
    if (typeof index === 'number' && index >= 0 && index < this.trails.trails.length && index !== this.selectedTrailIndex) {
      this.selectedTrailIndex = index;
      this.selectedTrail = this.trails.trails[index];
      this.changesDetector.detectChanges();
    }
  }

}
