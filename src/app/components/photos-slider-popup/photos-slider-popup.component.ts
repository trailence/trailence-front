import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { PhotosSliderComponent } from '../photos-slider/photos-slider.component';
import { Photo } from '@trailence/model/photo';
import { IonButton, IonIcon, ModalController } from "@ionic/angular";

@Component({
    selector: 'app-photos-slider-popup',
    templateUrl: './photos-slider-popup.component.html',
    styleUrls: ['./photos-slider-popup.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [IonIcon, IonButton, PhotosSliderComponent]
})
export class PhotosSliderPopupComponent {

  @Input() photos!: Photo[];
  @Input() index!: number;

  constructor(
    private readonly modalController: ModalController,
  ) { }

  close(): void {
    this.modalController.dismiss();
  }

}
