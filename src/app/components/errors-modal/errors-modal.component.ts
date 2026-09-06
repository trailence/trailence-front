import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { IonHeader, IonToolbar, IonContent, IonTitle, IonIcon, IonList, IonItem, IonButton, ModalController } from "@ionic/angular";
import { I18nService } from '@trailence/services/i18n/i18n.service';

@Component({
    selector: 'app-errors-modal',
    templateUrl: './errors-modal.component.html',
    styleUrls: [],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [IonButton, IonItem, IonList, IonIcon, IonTitle, IonContent, IonToolbar, IonHeader]
})
export class ErrorsModalComponent {

  @Input() errors: string[] = [];

  constructor(
    public i18n: I18nService,
    private readonly modalController: ModalController,
  ) { }

  removeError(index: number): void {
    this.errors.splice(index, 1);
    if (this.errors.length === 0) this.modalController.dismiss(null, 'close', 'errors-modal');
  }

}
