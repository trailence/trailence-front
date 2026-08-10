import { Component, Input, OnChanges, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { TrailCollection } from 'src/app/model/trail-collection';
import { IonHeader, IonToolbar, IonIcon, IonTitle, IonLabel, IonFooter, IonButtons, IonButton, ModalController, IonInput, IonToggle } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { FormsModule } from '@angular/forms';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Router } from '@angular/router';
import { first } from 'rxjs';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { Console } from 'src/app/utils/console';
import { TrailCollectionType } from 'src/app/model/dto/trail-collection';
import { EmailsValue, MultipleInputEmailComponent } from '../input-email/multiple-input-email.component';

@Component({
    selector: 'app-collection-form-popup',
    templateUrl: './collection-form-popup.component.html',
    styleUrl: './collection-form-popup.component.scss',
    imports: [
      IonInput, IonButton, IonButtons, IonFooter, IonLabel, IonTitle, IonIcon, IonToolbar, IonHeader, IonToggle,
      FormsModule,
      MultipleInputEmailComponent,
    ]
})
export class CollectionFormPopupComponent implements OnInit, OnChanges {

  @Input() collection?: TrailCollection;
  @Input() redirectOnApplied = false;

  uuid?: string;
  name = '';
  shared = false;
  sharedWith?: string[];
  sharedWithValid = true;
  forbiddenEmails: {[email: string]: string};
  applying = false;

  @ViewChild('input') input?: IonInput;

  constructor(
    public readonly i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly collectionService: TrailCollectionService,
    public readonly authService: AuthService,
    private readonly router: Router,
  ) {
    this.forbiddenEmails = {};
    this.forbiddenEmails[authService.email!] = i18n.texts.inputEmail.errors.cannotAddYourself;
  }

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
    if (this.collection?.type === TrailCollectionType.SHARED) {
      this.shared = true;
      this.sharedWith = this.collection?.sharedWith;
      this.sharedWithValid = true;
    }
    setTimeout(() => this.input?.setFocus(), 250);
  }

  setShared(value: boolean): void {
    this.shared = value;
    if (value) {
      this.sharedWith = [];
    } else {
      this.sharedWith = undefined;
      this.sharedWithValid = true;
    }
  }

  setEmails(emails: EmailsValue): void {
    this.sharedWith = emails.emails;
    this.sharedWithValid = emails.valid;
  }

  canApply(): boolean {
    return this.name.length > 0 && this.sharedWithValid;
  }

  hasChanges(): boolean {
    if (!this.collection) return true;
    if (this.collection.name !== this.name) return true;
    if (this.shared && this.sharedWith !== this.collection.sharedWith) return true;
    return false;
  }

  apply(): void {
    if (!this.canApply()) return;
    this.applying = true;
    if (!this.uuid) {
      this.collectionService.create(new TrailCollection({
        name: this.name,
        type: this.shared ? TrailCollectionType.SHARED : TrailCollectionType.CUSTOM,
        owner: this.authService.email,
        sharedWith: this.shared ? this.sharedWith : undefined,
        sharedBy: this.shared ? this.authService.email : undefined,
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
    } else if (!this.hasChanges()) {
      this.close(null);
    } else {
      this.collectionService.update(
        this.collection!,
        col => {
          col.name = this.name;
          if (this.shared) col.sharedWith = this.sharedWith;
        },
        col => this.close(col)
      );
    }
  }

  close(collection: TrailCollection | null) {
    this.modalController.dismiss(collection, collection ? 'apply' : 'cancel');
  }

}
