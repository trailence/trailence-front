import { Component, Injector, Input, OnInit } from '@angular/core';
import { ShareElementType } from 'src/app/model/dto/share';
import { Trail } from 'src/app/model/trail';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonInput, IonButton, IonFooter, IonButtons, ModalController, IonRadio, IonRadioGroup, IonCheckbox } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { filter, first } from 'rxjs';
import { TrailCollectionType } from 'src/app/model/trail-collection';
import { TagsComponent } from '../tags/tags.component';
import { Tag } from 'src/app/model/tag';
import { ShareService } from 'src/app/services/database/share.service';

enum SharePage {
  TYPE = 'type',
  ELEMENTS = 'elements',
  NAME_WHO = 'name_who',
}

@Component({
  selector: 'app-share-popup',
  templateUrl: './share-popup.component.html',
  styleUrls: ['./share-popup.component.scss'],
  standalone: true,
  imports: [IonCheckbox, IonRadioGroup, IonRadio, IonButtons, IonFooter, IonButton, IonInput, IonContent, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, CommonModule, FormsModule, TagsComponent ]
})
export class SharePopupComponent implements OnInit {

  @Input() collectionUuid!: string;
  @Input() trails!: Trail[];

  elementType?: ShareElementType;
  elements: string[] = [];
  name: string = '';
  to: string = '';
  toLanguage: string = 'en';
  includePhotos = false;

  pages: SharePage[] = [SharePage.TYPE, SharePage.ELEMENTS, SharePage.NAME_WHO];
  pageIndex = 0;

  collectionName = '';

  constructor(
    public i18n: I18nService,
    private modalController: ModalController,
    private injector: Injector,
  ) { }

  ngOnInit(): void {
    if (this.trails.length > 0) {
      this.elementType = ShareElementType.TRAIL;
      this.elements = this.trails.map(trail => trail.uuid);
      this.pages = [SharePage.NAME_WHO];
    } else {
      const email = this.injector.get(AuthService).email!;
      this.injector.get(TrailCollectionService).getCollection$(this.collectionUuid, email).pipe(
        filter(col => !!col),
        first()
      ).subscribe(col => {
        if (col!.name.length === 0 && col!.type === TrailCollectionType.MY_TRAILS)
          this.collectionName = this.i18n.texts.my_trails;
        else
          this.collectionName = col!.name;
      });
    }
    this.toLanguage = this.i18n.textsLanguage;
  }

  setElementType(type: string) {
    this.elementType = type as ShareElementType;
    if (this.elementType === ShareElementType.COLLECTION) {
      this.elements = [this.collectionUuid];
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
    return this.name.length > 0 && this.to.length > 0;
  }

  save(): void {
    this.injector.get(ShareService).create(this.elementType!, this.elements, this.name, this.to, this.toLanguage, this.includePhotos);
    this.modalController.dismiss(null, 'ok');
  }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }

}
