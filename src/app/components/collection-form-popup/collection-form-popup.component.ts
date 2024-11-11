import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { TrailCollection, TrailCollectionType } from 'src/app/model/trail-collection';
import { IonHeader, IonToolbar, IonIcon, IonTitle, IonLabel, IonContent, IonFooter, IonButtons, IonButton, ModalController, IonInput } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { FormsModule } from '@angular/forms';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Router } from '@angular/router';
import { filter, first } from 'rxjs';

@Component({
  selector: 'app-collection-form-popup',
  templateUrl: './collection-form-popup.component.html',
  styleUrls: [],
  standalone: true,
  imports: [IonInput, IonButton, IonButtons, IonFooter, IonContent, IonLabel, IonTitle, IonIcon, IonToolbar, IonHeader, FormsModule, ]
})
export class CollectionFormPopupComponent implements OnInit, OnChanges {

  @Input() collection?: TrailCollection;

  uuid?: string;
  name = '';

  constructor(
    public i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly collectionService: TrailCollectionService,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) { }

  ngOnInit() {
    this.update();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.update();
  }

  private update() {
    this.uuid = this.collection?.uuid;
    this.name = this.collection?.name ?? '';
    if (this.collection?.type === TrailCollectionType.MY_TRAILS && this.collection?.name === '') this.name = this.i18n.texts.my_trails;
  }

  canApply(): boolean {
    return this.name.length > 0;
  }

  apply(): void {
    if (!this.uuid)
      this.collectionService.create(new TrailCollection({
        name: this.name,
        type: TrailCollectionType.CUSTOM,
        owner: this.authService.email,
      }))
      .pipe(
        filter(col => !!col),
        first()
      )
      .subscribe(col => this.router.navigateByUrl('/trails/collection/' + col.uuid));
    else if (this.name !== this.collection!.name) {
      this.collection!.name = this.name;
      this.collectionService.update(this.collection!);
    }
    this.modalController.dismiss(null, 'apply');
  }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }

}
