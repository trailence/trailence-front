import { Component, EventEmitter, HostListener, Injector, Input, OnChanges, OnInit, Output } from '@angular/core';
import { SelectGroup, SelectItem } from './select.interface';
import { IonIcon } from '@ionic/angular';
import { InternalSelectItem } from './select.internal';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { Arrays } from '@trailence/utils/arrays';
import { I18nString } from '@trailence/services/i18n/i18n-string';
import { openSelectMultiplePopup, openSelectSinglePopup } from './select-popup.component';
import { FitContentAndMoreDirective } from '@trailence/utils/fit-content-and-more.directive';
import { AssetsService } from '@trailence/services/assets/assets.service';

@Component({
  selector: 'app-select',
  templateUrl: './select.component.html',
  styleUrl: './select.component.scss',
  imports: [
    IonIcon,
    FitContentAndMoreDirective,
  ]
})
export class SelectComponent<T> implements OnInit, OnChanges {

  @Input() items: SelectItem<T>[] = [];
  @Input() groups: SelectGroup[] = [];
  @Input() multiple = false;
  @Input() noneMeansAll = false;
  @Input() allKey?: string;
  @Input() noneKey?: string;

  @Input() selection: T[] = [];
  @Output() selectionChange = new EventEmitter<T[]>();

  @Input() separator: string | I18nString = ', ';
  @Input() popupTitleKey?: string;
  @Input() popupNeedsApply = true;

  _items: InternalSelectItem[] = [];
  _selection: SelectItem<T>[] = [];

  constructor(
    private readonly injector: Injector,
    public readonly i18n: I18nService,
    private readonly assets: AssetsService,
  ) {}

  ngOnInit(): void {
    this.refreshItems();
  }

  ngOnChanges(): void {
    this.refreshItems();
  }

  private refreshItems(): void {
    this._items = this.items.map(i => ({item: i, selected: this.selection.includes(i.value)}));
    this.refreshSelection();
  }

  private refreshSelection(): void {
    const newSelection = this._items.filter(i => i.selected).map(i => i.item);
    if (Arrays.equals(newSelection, this._selection)) return;
    this._selection = newSelection;
    const newValues = newSelection.map(i => i.value);
    if (!Arrays.equals(newValues, this.selection)) {
      this.selection = newValues;
      this.selectionChange.emit(newValues);
    }
  }

  _elementRenderer = (element: SelectItem<T>, index: number) => {
    const chip = document.createElement('DIV');
    chip.classList.add('item-chip');
    if (index > 0) {
      chip.appendChild(this._separatorElement());
    }
    if (element.icon) {
      const div = document.createElement('DIV');
      div.classList.add('icon');
      this.assets.getIcon(element.icon, true).subscribe(svg => {
        svg.classList.add('ionicon');
        div.appendChild(svg);
      });
      chip.appendChild(div);
    }
    chip.appendChild(this._labelElement(element));
    return chip;
  };

  _moreRenderer = (nb: number) => {
    const more = document.createElement('DIV');
    more.classList.add('item-more');
    more.innerHTML = '+' + nb;
    return more;
  };

  _label(item: SelectItem<T>): string {
    if (item.fixedLabel !== undefined) return item.fixedLabel;
    return this.i18n.translateWithArguments(item.labelI18n!, []);
  }

  _labelElement(item: SelectItem<T>): HTMLSpanElement {
    const span = document.createElement('SPAN');
    span.classList.add('item-label');
    span.appendChild(document.createTextNode(this._label(item)));
    return span;
  }

  _separatorElement(): HTMLSpanElement {
    const span = document.createElement('SPAN');
    span.classList.add('item-separator');
    span.appendChild(document.createTextNode(typeof this.separator === 'string' ? this.separator : this.separator.translate(this.i18n)));
    return span;
  }

  @HostListener('click')
  async click() {
    if (this.multiple) {
      const newSelection = await openSelectMultiplePopup(this.injector, this.items, this.groups, [...this.selection], {
        titleKey: this.popupTitleKey,
        allKey: this.allKey,
        noneKey: this.noneKey,
        noneMeansAll: this.noneMeansAll,
        onSelectionChanged: this.popupNeedsApply ? undefined : value => {
          this._items.forEach(i => i.selected = value.includes(i.item.value));
          this.refreshSelection();
        }
      });
      if (this.popupNeedsApply || newSelection === undefined) return;
      this._items.forEach(i => i.selected = newSelection.includes(i.item.value));
      this.refreshSelection();
    } else {
      const newSelection = await openSelectSinglePopup(this.injector, this.items, this.groups, this.selection.length > 0 ? this.selection[0] : undefined, {
        titleKey: this.popupTitleKey,
        onSelectionChanged: this.popupNeedsApply ? undefined : value => {
          this._items.forEach(i => i.selected = i.item.value === value);
          this.refreshSelection();
        }
      });
      if (this.popupNeedsApply || newSelection === undefined) return;
      this._items.forEach(i => i.selected = i.item.value === newSelection);
      this.refreshSelection();
    }
  }

}
