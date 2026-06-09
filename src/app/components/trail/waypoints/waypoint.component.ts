import { Component, EventEmitter, Input, OnChanges, OnInit, Output } from '@angular/core';
import { TrailWaypoints, WayPointWithPhotos } from '../trail-waypoints';
import { IonIcon, IonButton } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { PhotosSliderComponent } from '../../photos-slider/photos-slider.component';
import { WayPointFromTrack } from 'src/app/utils/track-waypoints/waypoints-from-track';
import { TextComponent } from '../../text/text.component';
import { Photo } from 'src/app/model/photo';
import { PhotoService } from 'src/app/services/database/photo.service';

@Component({
  selector: 'app-waypoint',
  templateUrl: './waypoint.component.html',
  styleUrl: './waypoint.component.scss',
  imports: [
    IonIcon, IonButton,
    PhotosSliderComponent,
    TextComponent,
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
  img: string | undefined;

  private update() {
    this.arrival = this.forceArrival || (!!this.wp.trackWayPoint?.isArrival && !this.wp.trackWayPoint?.isDeparture);
    this.position = this.wp.waypoint.position;
    this.altitude = this.wp.waypoint.altitude;
    this.distance = this.arrival && this.wp.trackWayPoint?.isDeparture ? this.trail.track.metadata?.distance : this.wp.waypoint.distanceFromDeparture;
    this.time = this.arrival && this.wp.trackWayPoint?.isDeparture ? this.trail.track.metadata?.duration : this.wp.waypoint.getDurationFromDepartureWithoutBreaks(this.trail.wayPoints.map(wp => wp.waypoint));
    this.img = this.trail.wayPointsImages[this.imgIndex];
  }

  openPhotos(photos: Photo[], slider: PhotosSliderComponent): void {
    this.photoService.openSliderPopup(photos, slider.index);
  }

}
