import { Component, Injector, Input } from '@angular/core';
import { IonList, IonItem, IonIcon, IonLabel, PopoverController } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapComponent } from '../../map.component';
import { RotateMode } from '../../map-state';
import { GeolocationService } from 'src/app/services/geolocation/geolocation.service';
import { AsyncPipe } from '@angular/common';

export async function openRotatePopover(injector: Injector, event: Event, map: MapComponent) {
  const popover = await injector.get(PopoverController).create({
    component: RotatePopoverComponent,
    componentProps: {
      map,
    },
    event: event,
    side: 'right',
  });
  await popover.present();
}

@Component({
  templateUrl: './rotate-popover.component.html',
  styleUrl: './rotate-popover.component.scss',
  imports: [
    IonList, IonItem, IonIcon, IonLabel,
    AsyncPipe,
  ]
})
export class RotatePopoverComponent {

  @Input() map!: MapComponent;

  constructor(
    public readonly i18n: I18nService,
    private readonly controller: PopoverController,
    public readonly geolocation: GeolocationService,
  ) {}

  get bearing(): number {
    return this.map.getState().bearing;
  }

  setBearing(event: MouseEvent): void {
    const rect = (event.target as SVGSVGElement).getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const dx = x - 64;
    const dy = y - 64;

    // Bearing: 0° = North, clockwise
    let bearing = Math.atan2(dx, -dy) * 180 / Math.PI;

    if (bearing < 0)
        bearing += 360;
    this.map.setRotationMode(RotateMode.CUSTOM);
    this.map.setBearing(bearing);
  }

  setNorth(): void {
    this.map.setRotationMode(RotateMode.NORTH);
    this.controller.dismiss();
  }

  setHeading(): void {
    this.map.setRotationMode(RotateMode.HEADING);
    this.controller.dismiss();
  }

}
