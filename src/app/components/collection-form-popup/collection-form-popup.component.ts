import { Component, Input, OnChanges, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { TrailCollection } from 'src/app/model/trail-collection';
import { IonHeader, IonToolbar, IonIcon, IonTitle, IonLabel, IonContent, IonFooter, IonButtons, IonButton, ModalController, IonInput } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { FormsModule } from '@angular/forms';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Router } from '@angular/router';
import { first } from 'rxjs';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { Console } from 'src/app/utils/console';
import { TrailCollectionType } from 'src/app/model/dto/trail-collection';

@Component({
    selector: 'app-collection-form-popup',
    templateUrl: './collection-form-popup.component.html',
    styleUrls: [],
    imports: [IonInput, IonButton, IonButtons, IonFooter, IonContent, IonLabel, IonTitle, IonIcon, IonToolbar, IonHeader, FormsModule,]
})
export class CollectionFormPopupComponent implements OnInit, OnChanges {

  @Input() collection?: TrailCollection;
  @Input() redirectOnApplied = false;

  uuid?: string;
  name = '';
  applying = false;

  @ViewChild('input') input?: IonInput;

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
    setTimeout(() => this.input?.setFocus(), 250);
  }

  canApply(): boolean {
    return this.name.length > 0;
  }

  apply(): void {
    if (!this.canApply()) return;
    this.applying = true;
    if (!this.uuid) {
      this.collectionService.create(new TrailCollection({
        name: this.name,
        type: TrailCollectionType.CUSTOM,
        owner: this.authService.email,
      }))
      .pipe(
        filterDefined(),
        first()
      )
      .subscribe({
        next: col => {
          this.close(col);
          if (this.redirectOnApplied)
            this.router.navigateByUrl('/trails/collection/' + col.uuid);
        },
        error: e => {
          Console.error(e);
          this.applying = false;
        }
      });
    } else if (this.name === this.collection!.name) {
      this.close(null);
    } else {
      this.collectionService.update(this.collection!, col => col.name = this.name, col => this.close(col));
    }
  }

  close(collection: TrailCollection | null) {
    this.modalController.dismiss(collection, collection ? 'apply' : 'cancel');
  }

}
