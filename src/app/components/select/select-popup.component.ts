import { Component, Injector, Input, OnInit } from '@angular/core';
import { ModalController, IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonList, IonItem, IonCheckbox, IonRadioGroup, IonRadio, IonFooter, IonButtons, IonButton, IonIcon } from '@ionic/angular';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { NgTemplateOutlet } from '@angular/common';
import { Arrays } from '@trailence/utils/arrays';
import { SelectGroup, SelectItem } from './select.interface';
import { buildRoot, InternalSelectGroup, InternalSelectItem } from './select.internal';

export interface SelectMultipleOptions<T> {
  titleKey?: string;
  allKey?: string;
  noneKey?: string;
  noneMeansAll?: boolean;
  onSelectionChanged?: (value: T[]) => any;
}

export interface SelectSingleOptions<T> {
  titleKey?: string;
  onSelectionChanged?: (value: T) => any;
}

export async function openSelectMultiplePopup<T>(injector: Injector, items: SelectItem<T>[], groups: SelectGroup[] | undefined, selected: T[], options?: SelectMultipleOptions<T>): Promise<T[] | undefined> {
  return await openSelectPopup<T>(injector, items, groups, selected, true, options?.titleKey, options?.onSelectionChanged, options?.allKey, options?.noneKey, options?.noneMeansAll);
}

export async function openSelectSinglePopup<T>(injector: Injector, items: SelectItem<T>[], groups: SelectGroup[] | undefined, selected: T | undefined, options?: SelectSingleOptions<T>): Promise<T | undefined> {
  const onSelectionChanged = options?.onSelectionChanged ? (values: T[]) => {
    if (values.length > 0) options!.onSelectionChanged!(values[0]);
  } : undefined;
  const selection = await openSelectPopup<T>(injector, items, groups, selected === undefined ? [] : [selected], false, options?.titleKey, onSelectionChanged);
  return selection?.length ? selection[0] : undefined;
}

async function openSelectPopup<T>( // NOSONAR
  injector: Injector,
  items: SelectItem<T>[], groups: SelectGroup[] | undefined,
  selected: T[],
  multiple: boolean,
  titleKey: string | undefined,
  onSelectionChanged?: (value: T[]) => any,
  allKey?: string,
  noneKey?: string,
  noneMeansAll?: boolean,
): Promise<T[] | undefined> {
  const controller = injector.get(ModalController);
  const modal = await controller.create({
    component: SelectPopupComponent,
    componentProps: {
      items,
      groups,
      initialSelection: selected,
      multiple,
      titleKey,
      onSelectionChanged,
      allKey,
      noneKey,
      noneMeansAll: noneMeansAll ?? false,
    },
    cssClass: 'auto-height'
  });
  const resultPromise = modal.onDidDismiss().then(event => {
    if (event.role === 'ok') return event.data;
    return undefined;
  });
  await modal.present();
  return await resultPromise;
}

@Component({
  templateUrl: './select-popup.component.html',
  styleUrl: './select-popup.component.scss',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonList, IonItem, IonCheckbox, IonRadioGroup, IonRadio, IonFooter, IonButtons, IonButton, IonIcon,
    NgTemplateOutlet,
]
})
export class SelectPopupComponent<T> implements OnInit {

  @Input() items!: SelectItem<T>[];
  @Input() groups?: SelectGroup[];
  @Input() multiple = false;
  @Input() titleKey?: string;
  @Input() onSelectionChanged?: (value: T[]) => any;
  @Input() noneMeansAll = false;
  @Input() allKey?: string;
  @Input() noneKey?: string;

  @Input() initialSelection!: T[];

  _root: InternalSelectGroup = { subGroups: [], items: [] };
  _currentSelection: T[] = [];

  constructor(
    private readonly i18n: I18nService,
    private readonly modalController: ModalController,
  ) {}

  ngOnInit(): void {
    this._currentSelection = [...this.initialSelection];
    this._root = buildRoot(this.groups, this.items, this._currentSelection);
  }

  cancel(): void {
    void this.modalController.dismiss(undefined, 'cancel');
  }

  apply(): void {
    void this.modalController.dismiss(this.getResult(), 'ok');
  }

  canApply(): boolean {
    return !Arrays.sameContent(this.initialSelection, this.getResult());
  }

  private getResult(): T[] {
    return this.noneMeansAll && this._currentSelection.length === this.items.length ? [] : this._currentSelection;
  }

  label(element: SelectItem<T> | SelectGroup): string {
    if (element.fixedLabel !== undefined) return element.fixedLabel;
    return this.i18n.translateWithArguments(element.labelI18n!, []);
  }

  setItemSelected(item: InternalSelectItem, selected: boolean): void {
    item.selected = selected;
    if (!this.multiple) this.onAllItems(this._root, i => { if (i !== item) i.selected = false; });
    this.refreshSelection();
  }

  selectAll(): void {
    this.onAllItems(this._root, i => i.selected = true);
    this.refreshSelection();
  }

  selectNone(): void {
    this.onAllItems(this._root, i => i.selected = false);
    this.refreshSelection();
  }

  private onAllItems(parent: InternalSelectGroup, apply: (item: InternalSelectItem) => any): void {
    for (const item of parent.items) apply(item);
    for (const group of parent.subGroups) this.onAllItems(group, apply);
  }

  private refreshSelection(): void {
    this._currentSelection = [];
    this.onAllItems(this._root, item => { if (item.selected) this._currentSelection.push(item.item.value); });
    if (this.onSelectionChanged) this.onSelectionChanged(this.getResult());
  }

  isGroupFullySelected(group: InternalSelectGroup): boolean {
    return group.items.every(i => i.selected) && group.subGroups.every(g => this.isGroupFullySelected(g));
  }

  isGroupPartiallySelected(group: InternalSelectGroup): boolean {
    let nbTotal = 0;
    let nbSelected = 0;
    this.onAllItems(group, i => {
      nbTotal++;
      if (i.selected) nbSelected++;
    });
    return nbSelected > 0 && nbSelected < nbTotal;
  }

  setGroupSelected(group: InternalSelectGroup, selected: boolean) {
    this.onAllItems(group, i => i.selected = selected);
    this.refreshSelection();
  }

  toggleGroupSelected(group: InternalSelectGroup): void {
    let hasSelected = false;
    this.onAllItems(group, i => hasSelected ||= i.selected);
    this.setGroupSelected(group, !hasSelected);
  }

  setSelection(selected: T[]): void {
    this.onAllItems(this._root, i => i.selected = selected.includes(i.item.value));
    this.refreshSelection();
  }
}
