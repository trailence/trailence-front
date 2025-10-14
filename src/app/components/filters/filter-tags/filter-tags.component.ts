import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FilterTags } from '../filter';
import { TagService } from 'src/app/services/database/tag.service';
import { Tag } from 'src/app/model/tag';
import { Subscription } from 'rxjs';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonButton, IonModal, IonIcon, IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonRadioGroup, IonRadio, IonCheckbox, IonButtons, IonFooter } from "@ionic/angular/standalone";
import { IdGenerator } from 'src/app/utils/component-utils';

@Component({
    selector: 'app-filter-tags',
    templateUrl: './filter-tags.component.html',
    styleUrls: [],
    imports: [IonFooter, IonButtons, IonCheckbox, IonRadio, IonRadioGroup, IonContent, IonLabel, IonTitle, IonToolbar, IonHeader, IonIcon, IonModal, IonButton]
})
export class FilterTagsComponent implements OnInit, OnDestroy {

  @Input() collectionUuid!: string;
  @Input() filter!: FilterTags;
  @Output() filterChange = new EventEmitter<FilterTags>();

  id = IdGenerator.generateId();
  tags: Tag[] = [];
  tagsByUuid = new Map<string, Tag>();

  private subscription?: Subscription;

  constructor(
    public i18n: I18nService,
    private readonly tagService: TagService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
  }

  ngOnInit(): void {
    this.subscription = this.tagService.getAllTags$().pipe(collection$items())
    .subscribe(
      allTags => {
        this.tags = allTags.filter(t => t.collectionUuid === this.collectionUuid);
        this.tagsByUuid.clear();
        for (const tag of this.tags) this.tagsByUuid.set(tag.uuid, tag);
        this.changeDetector.detectChanges();
      }
    );
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  updateType(value: any): void {
    this.filter.type = value;
    if (value === 'onlyWithAnyTag' || value === 'onlyWithoutAnyTag')
      this.filter.tagsUuids = [];
    this.filterChange.emit(this.filter);
    this.changeDetector.detectChanges();
  }

  updateTagSelection(tag: Tag, selected: boolean): void {
    const index = this.filter.tagsUuids.indexOf(tag.uuid);
    if (selected) {
      if (index < 0) {
        this.filter.tagsUuids.push(tag.uuid);
        this.filterChange.emit(this.filter);
        this.changeDetector.detectChanges();
      }
    } else if (index >= 0) {
      this.filter.tagsUuids.splice(index, 1);
      this.filterChange.emit(this.filter);
      this.changeDetector.detectChanges();
    }
  }

}
