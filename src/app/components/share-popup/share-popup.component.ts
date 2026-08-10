import { Component, Injector, Input, OnInit } from '@angular/core';
import { ShareElementType } from 'src/app/model/dto/share';
import { Trail } from 'src/app/model/trail';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonInput, IonButton, IonFooter, IonButtons, ModalController, IonRadio, IonRadioGroup, IonCheckbox } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { FormsModule } from '@angular/forms';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Observable, of } from 'rxjs';
import { TagsComponent } from '../tags/tags.component';
import { Tag } from 'src/app/model/tag';
import { ShareService } from 'src/app/services/database/share.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { Share } from 'src/app/model/share';
import { TrailCollectionType } from 'src/app/model/dto/trail-collection';
import { TranslatedString } from 'src/app/services/i18n/i18n-string';
import { TagService } from 'src/app/services/database/tag.service';
import { AsyncPipe } from '@angular/common';
import { AvailableLocales, LocaleKey } from 'src/app/services/i18n/available-locales';
import { EmailsValue, MultipleInputEmailComponent } from '../input-email/multiple-input-email.component';
import { TrailCollection } from 'src/app/model/trail-collection';

export function openSharePopup(injector: Injector, collection: TrailCollection, trails: Trail[]) {
  injector.get(ModalController).create({
    component: SharePopupComponent,
    componentProps: {
      collection,
      trails
    }
  }).then(modal => modal.present());
}


enum SharePage {
  TYPE = 'type',
  ELEMENTS = 'elements',
  NAME_WHO = 'name_who',
}

@Component({
    selector: 'app-share-popup',
    templateUrl: './share-popup.component.html',
    styleUrls: ['./share-popup.component.scss'],
    imports: [
      IonCheckbox, IonRadioGroup, IonRadio, IonButtons, IonFooter, IonButton, IonInput, IonContent, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader,
      FormsModule,
      TagsComponent,
      AsyncPipe,
      MultipleInputEmailComponent,
    ]
})
export class SharePopupComponent implements OnInit {

  @Input() collection?: TrailCollection;
  @Input() trails?: Trail[];
  @Input() share?: Share;

  elementType?: ShareElementType;
  elements: string[] = [];
  name: string = '';
  recipients: EmailsValue = {emails: [], valid: true};
  mailLanguage: LocaleKey = 'en';
  includePhotos = false;

  pages: SharePage[] = [SharePage.TYPE, SharePage.ELEMENTS, SharePage.NAME_WHO];
  pageIndex = 0;

  collectionName = '';
  shareDescription: Observable<string> = of('');

  languages = Object.values(AvailableLocales);

  email: string;
  forbiddenEmails: {[email: string]: string};

  constructor(
    public i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly injector: Injector,
    private readonly prefService: PreferencesService,
    auth: AuthService,
  ) {
    this.email = auth.email!;
    this.forbiddenEmails = {};
    this.forbiddenEmails[this.email] = i18n.texts.inputEmail.errors.cannotAddYourself;
  }

  ngOnInit(): void {
    if (this.share) {
      this.pages = [SharePage.NAME_WHO];
      this.name = this.share.name;
      this.recipients = {emails: this.share.recipients, valid: true};
      this.includePhotos = this.share.includePhotos;
      let sharing: TranslatedString;
      switch (this.share.type) {
        case ShareElementType.COLLECTION:
          sharing = new TranslatedString('pages.share_popup.share_description.COLLECTION', [this.injector.get(TrailCollectionService).getCollectionName$(this.share.elements[0])]);
          break;
        case ShareElementType.TRAIL:
          sharing = new TranslatedString('pages.share_popup.share_description.TRAIL', [this.share.elements.length]);
          break;
        case ShareElementType.TAG:
          sharing = new TranslatedString('pages.share_popup.share_description.TAGS', [this.injector.get(TagService).getTagsFullnames$(this.email, this.share.elements)]);
      }
      this.shareDescription = sharing.translate$(this.i18n);
    } else if (this.trails!.length > 0) {
      this.elementType = ShareElementType.TRAIL;
      this.elements = this.trails!.map(trail => trail.uuid);
      this.pages = [SharePage.NAME_WHO];
      this.shareDescription = new TranslatedString('pages.share_popup.share_description.TRAIL', [this.elements.length]).translate$(this.i18n);
    } else {
      if (this.collection!.name.length === 0 && this.collection!.type === TrailCollectionType.MY_TRAILS)
        this.collectionName = this.i18n.texts.my_trails;
      else
        this.collectionName = this.collection!.name;
    }
    this.mailLanguage = this.prefService.preferences.lang;
  }

  setElementType(type: string) {
    this.elementType = type as ShareElementType;
    if (this.elementType === ShareElementType.COLLECTION) {
      this.elements = [this.collection!.uuid];
      this.pages = [SharePage.TYPE, SharePage.NAME_WHO];
      this.shareDescription = new TranslatedString('pages.share_popup.share_description.COLLECTION', [this.injector.get(TrailCollectionService).getCollectionName$(this.collection!.uuid)]).translate$(this.i18n);
    } else {
      this.elements = [];
      this.pages = [SharePage.TYPE, SharePage.ELEMENTS, SharePage.NAME_WHO];
      this.shareDescription = of('');
    }
  }

  tagsSelected(tags: Tag[]): void {
    this.elements = tags.map(tag => tag.uuid);
    if (this.elements.length > 0) {
      this.shareDescription = new TranslatedString('pages.share_popup.share_description.TAGS', [this.injector.get(TagService).getTagsFullnames$(this.email, this.elements)]).translate$(this.i18n);
    } else {
      this.shareDescription = of('');
    }
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
    return this.name.length > 0 && this.recipients.valid;
  }

  save(): void {
    if (!this.canSave()) return;
    const service = this.injector.get(ShareService);
    if (this.share) {
      const newName = this.name;
      const newIncludePhotos = this.includePhotos;
      const newRecipients = this.recipients.emails;
      const newMailLanguage = this.mailLanguage;
      this.share.name = newName;
      this.share.includePhotos = newIncludePhotos;
      this.share.recipients = newRecipients;
      this.share.mailLanguage = newMailLanguage;
      service.update(this.share, s => {
        s.name = newName;
        s.includePhotos = newIncludePhotos;
        s.recipients = newRecipients;
        s.mailLanguage = newMailLanguage;
      });
    } else {
      service.create(this.elementType!, this.elements, this.name, this.recipients.emails, this.mailLanguage, this.includePhotos).subscribe();
    }
    this.close('ok');
  }

  setRecipients(value: EmailsValue): void {
    this.recipients = value;
  }

  close(role: string): void {
    this.modalController.dismiss(null, role);
  }

}
