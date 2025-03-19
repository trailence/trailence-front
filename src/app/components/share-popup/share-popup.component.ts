import { Component, Injector, Input, OnInit } from '@angular/core';
import { ShareElementType } from 'src/app/model/dto/share';
import { Trail } from 'src/app/model/trail';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonInput, IonButton, IonFooter, IonButtons, ModalController, IonRadio, IonRadioGroup, IonCheckbox } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { first } from 'rxjs';
import { TrailCollectionType } from 'src/app/model/trail-collection';
import { TagsComponent } from '../tags/tags.component';
import { Tag } from 'src/app/model/tag';
import { ShareService } from 'src/app/services/database/share.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { EMAIL_REGEX } from 'src/app/utils/string-utils';
import { Share } from 'src/app/model/share';

export function openSharePopup(injector: Injector, collectionUuid: string, trails: Trail[]) {
  injector.get(ModalController).create({
    component: SharePopupComponent,
    componentProps: {
      collectionUuid,
      trails
    }
  }).then(modal => modal.present());
}


enum SharePage {
  TYPE = 'type',
  ELEMENTS = 'elements',
  NAME_WHO = 'name_who',
}

interface Recipient {
  email: string;
  error: boolean;
}

@Component({
    selector: 'app-share-popup',
    templateUrl: './share-popup.component.html',
    styleUrls: ['./share-popup.component.scss'],
    imports: [IonCheckbox, IonRadioGroup, IonRadio, IonButtons, IonFooter, IonButton, IonInput, IonContent, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, CommonModule, FormsModule, TagsComponent]
})
export class SharePopupComponent implements OnInit {

  @Input() collectionUuid?: string;
  @Input() trails?: Trail[];
  @Input() share?: Share;

  elementType?: ShareElementType;
  elements: string[] = [];
  name: string = '';
  recipients: Recipient[] = [{email: '', error: false}];
  mailLanguage: string = 'en';
  includePhotos = false;

  pages: SharePage[] = [SharePage.TYPE, SharePage.ELEMENTS, SharePage.NAME_WHO];
  pageIndex = 0;

  collectionName = '';

  constructor(
    public i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly injector: Injector,
    private readonly prefService: PreferencesService,
  ) { }

  ngOnInit(): void {
    if (this.share) {
      this.pages = [SharePage.NAME_WHO];
      this.name = this.share.name;
      this.recipients = this.share.recipients.map(r => ({email: r, error: false}));
      this.recipients.push({email: '', error: false});
      this.includePhotos = this.share.includePhotos;
    } else if (this.trails!.length > 0) {
      this.elementType = ShareElementType.TRAIL;
      this.elements = this.trails!.map(trail => trail.uuid);
      this.pages = [SharePage.NAME_WHO];
    } else {
      const email = this.injector.get(AuthService).email!;
      this.injector.get(TrailCollectionService).getCollection$(this.collectionUuid!, email).pipe(
        filterDefined(),
        first()
      ).subscribe(col => {
        if (col.name.length === 0 && col.type === TrailCollectionType.MY_TRAILS)
          this.collectionName = this.i18n.texts.my_trails;
        else
          this.collectionName = col.name;
      });
    }
    this.mailLanguage = this.prefService.preferences.lang;
  }

  setElementType(type: string) {
    this.elementType = type as ShareElementType;
    if (this.elementType === ShareElementType.COLLECTION) {
      this.elements = [this.collectionUuid!];
      this.pages = [SharePage.TYPE, SharePage.NAME_WHO];
    } else {
      this.elements = [];
      this.pages = [SharePage.TYPE, SharePage.ELEMENTS, SharePage.NAME_WHO];
    }
  }

  tagsSelected(tags: Tag[]): void {
    this.elements = tags.map(tag => tag.uuid);
  }

  previous(): void {
    this.pageIndex--;
  }

  next(): void {
    this.pageIndex++;
  }

  canGoNext(): boolean {
    switch (this.pages[this.pageIndex]) {
      case SharePage.TYPE: return !!this.elementType;
      case SharePage.ELEMENTS: return this.elements.length > 0;
    }
    return false;
  }

  canSave(): boolean {
    return this.name.length > 0 && this.checkRecipients().length > 0;
  }

  save(): void {
    if (!this.canSave()) return;
    const service = this.injector.get(ShareService);
    if (!this.share)
      service.create(this.elementType!, this.elements, this.name, this.checkRecipients(), this.mailLanguage, this.includePhotos).subscribe();
    else {
      this.share.name = this.name;
      this.share.includePhotos = this.includePhotos;
      this.share.recipients = this.checkRecipients();
      this.share.mailLanguage = this.mailLanguage;
      service.update(this.share);
    }
    this.close('ok');
  }

  checkRecipients(): string[] {
    return this.recipients.filter(email => {
      const s = email.email.trim();
      if (s.length === 0) return false;
      if (!EMAIL_REGEX.test(s)) return false;
      return true;
    }).map(r => r.email);
  }

  setRecipient(index: number, value: string | null | undefined): void {
    this.recipients[index] = {email: value ?? '', error: false};
    const owner = this.injector.get(AuthService).email!;
    const remove = (email: string, index: number) => {
      const s = email.trim().toLowerCase();
      if (s.length === 0) return true;
      if (s === owner.toLowerCase()) return true;
      for (let j = 0; j < index; ++j) {
        if (this.recipients[j].email.trim().toLowerCase() === s) return true;
      }
      return false;
    };
    for (let i = 0; i < this.recipients.length; ++i) {
      if (remove(this.recipients[i].email, i)) {
        this.recipients.splice(i, 1);
        i--;
      } else {
        this.recipients[i].error = !EMAIL_REGEX.test(this.recipients[i].email);
      }
    }
    if (this.recipients.length < 20 && (this.recipients.length === 0 || this.recipients[this.recipients.length - 1].email.trim().length > 0))
      this.recipients.push({email:'', error: false});
    this.recipients = [...this.recipients];
  }

  close(role: string): void {
    this.modalController.dismiss(null, role);
  }

}
