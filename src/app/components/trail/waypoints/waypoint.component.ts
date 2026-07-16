import { Component, EventEmitter, Input, OnChanges, OnInit, Output } from '@angular/core';
import { TrailWaypoints, WayPointWithPhotos } from '../trail-waypoints';
import { IonIcon, IonButton } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { PhotosSliderComponent } from '../../photos-slider/photos-slider.component';
import { WayPointFromTrack } from 'src/app/utils/track-waypoints/waypoints-from-track';
import { TextComponent } from '../../text/text.component';
import { Photo } from 'src/app/model/photo';
import { PhotoService } from 'src/app/services/database/photo.service';
import { SvgContainerComponent } from '../../svg-container/svg-container.component';
import { TrackPointReference } from 'src/app/utils/track-computed-data/types';
import { TrackUtils } from 'src/app/utils/track-utils';

@Component({
  selector: 'app-waypoint',
  templateUrl: './waypoint.component.html',
  styleUrl: './waypoint.component.scss',
  imports: [
    IonIcon, IonButton,
    PhotosSliderComponent,
    TextComponent,
    SvgContainerComponent,
  ]
})
export class WayPointComponent implements OnInit, OnChanges {

  @Input() trail!: TrailWaypoints;
  @Input() wp!: WayPointWithPhotos;
  @Input() imgIndex!: number;

  @Input() forceArrival: boolean = false;
  @Input() showActions: boolean = false;

  @Input() lang?: string;
  @Input() showSource = false;

  @Input() followingPosition: TrackPointReference | undefined;

  @Output() editWayPoint = new EventEmitter<WayPointFromTrack>();
  @Output() removeWayPoint = new EventEmitter<WayPointFromTrack>();

  constructor(
    public readonly i18n: I18nService,
    private readonly photoService: PhotoService,
  ) {}

  ngOnInit(): void {
    this.update();
  }

  ngOnChanges(): void {
    this.update();
  }

  arrival!: boolean;

  position!: {lat: number, lng: number};
  altitude?: number;
  distance?: number;
  time?: number;
  estimatedTime?: number;
  img: string | undefined;
  intersectionImg: SVGSVGElement | undefined;
  anchorIconHeight = 40;
  followingHeight: number | undefined;

  private update() {
    this.arrival = this.forceArrival || (!!this.wp.trackWayPoint?.isArrival && !this.wp.trackWayPoint?.isDeparture);
    this.position = this.wp.waypoint.position;
    this.altitude = this.wp.waypoint.altitude;
    this.distance = this.arrival && this.wp.trackWayPoint?.isDeparture ? this.trail.track.metadata?.distance : this.wp.waypoint.distanceFromDeparture;
    this.time = this.arrival && this.wp.trackWayPoint?.isDeparture ? this.trail.track.metadata?.duration : this.wp.waypoint.getDurationFromDepartureWithoutBreaks(this.trail.wayPoints.map(wp => wp.waypoint));
    this.estimatedTime = this.wp.waypoint.estimatedTimeSinceStart;
    if (this.estimatedTime === undefined && this.arrival) this.estimatedTime = this.trail.track.computed.timeEstimationSnapshot.total;
    this.img = this.trail.wayPointsImages[this.imgIndex];
    this.intersectionImg = this.trail.intersectionsImages[this.imgIndex];
    if (this.wp.trackWayPoint || (this.wp.breakPoint && this.trail.showBreaks)) {
      this.anchorIconHeight = 40;
    } else if (this.wp.guidepost) {
      this.anchorIconHeight = 24;
    }
    this.followingHeight = undefined;
    if (this.followingPosition) {
      const wpRef = this.wp.waypoint.nearestTrackPointReference;
      const compare = TrackUtils.compare(this.followingPosition, wpRef);
      if (compare <= 0) this.followingHeight = undefined;
      else {
        const next = this.trail.getNextVisible(this.wp);
        if (next) {
          const nextRef = next.waypoint.nearestTrackPointReference;
          const compare2 = TrackUtils.compare(this.followingPosition, nextRef);
          if (compare2 >= 0) {
            this.followingHeight = 100;
          } else {
            const start = this.trail.track.getPoint(wpRef);
            const end = this.trail.track.getPoint(nextRef);
            const pos = this.trail.track.getPoint(this.followingPosition);
            let distance1 = 0;
            for (let p = pos; p !== start; p = p.previousPoint!) distance1 += p.distanceFromPreviousPoint;
            let distance2 = 0;
            for (let p = end; p !== pos; p = p.previousPoint!) distance2 += p.distanceFromPreviousPoint;
            this.followingHeight = distance1 * 100 / (distance1 + distance2);
          }
        }
      }
    }
  }

  openPhotos(photos: Photo[], slider: PhotosSliderComponent): void {
    this.photoService.openSliderPopup(photos, slider.index);
  }

}
