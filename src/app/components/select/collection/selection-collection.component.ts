import { ChangeDetectorRef, Component, EventEmitter, Injector, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CollectionItem, getCollectionsItems } from './select-collection';
import { SelectComponent } from '../select.component';
import { SelectGroup, SelectItem } from '../select.interface';
import { TrailCollectionType } from '@trailence/model/dto/trail-collection';
import { AuthService } from '@trailence/services/auth/auth.service';
import { Arrays } from '@trailence/utils/arrays';

@Component({
  selector: 'app-select-collections',
  template: `
    <app-select
      [items]="items"
      [groups]="groups"
      [multiple]="multiple"
      [selection]="selection"
      (selectionChange)="selectionChange.emit($event)"
      [popupTitleKey]="popupTitleKey"
    ></app-select>
  `,
  styles: ``,
  imports: [
    SelectComponent,
  ]
})
export class SelectCollectionComponent implements OnChanges {

  @Input() includePublicationCollections = false;
  @Input() includeSharesWithMe = false;
  @Input() multiple = false;
  @Input() popupTitleKey = 'menu.collections';

  @Input() selection: CollectionItem[] = [];
  @Output() selectionChange = new EventEmitter<CollectionItem[]>();

  items: SelectItem<CollectionItem>[] = [];
  groups: SelectGroup[] = [];

  constructor(
    private readonly injector: Injector,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['includePublicationCollections'] || changes['includeSharesWithMe'])
      this.updateItems();
    if (changes['selection'])
      this.updateSelection();
  }

  private updateItems(): void {
    void getCollectionsItems(this.injector, this.includePublicationCollections, this.includeSharesWithMe)
    .then(result => {
      this.items = result.items;
      this.groups = result.groups ?? [];
      this.updateSelection();
    });
  }

  private updateSelection(): void {
    const mappedSelection = this.selection.map(value => {
      let item = this.items.find(i => i.value === value);
      if (!item && value.uuid === 'my_trails')
        item = this.items.find(i => i.value.collection?.type === TrailCollectionType.MY_TRAILS);
      if (!item) {
        const email = this.injector.get(AuthService).email;
        item = this.items.find(i => i.value.uuid === value.uuid && i.value.owner === (value.owner ?? email));
      }
      if (!item) return value;
      return item.value;
    });
    if (!Arrays.equals(this.selection, mappedSelection))
      this.selection = mappedSelection;
    this.changeDetector.markForCheck();
  }

}
