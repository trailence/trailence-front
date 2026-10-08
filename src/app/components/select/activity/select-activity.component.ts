import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { SelectComponent } from '../select.component';
import { TrailActivity } from '@trailence/model/dto/trail-activity';
import { ACTIVITIES_POPUP_TITLE_KEY, getActivityItems } from './select-activity';
import { SelectGroup, SelectItem } from '../select.interface';
import { Arrays } from '@trailence/utils/arrays';
import { I18nString } from '@trailence/services/i18n/i18n-string';
import { I18nService } from '@trailence/services/i18n/i18n.service';

@Component({
  selector: 'app-select-activities',
  template: `
    <app-select
      [items]="_items"
      [groups]="_groups"
      [selection]="_value"
      (selectionChange)="setValue($event)"
      [multiple]="true"
      [popupTitleKey]="popupTitleKey"
      [separator]="' ' + i18n.texts.select.activities.or + ' '"
      allKey="select.activities.all"
      [noneMeansAll]="true"
      [popupNeedsApply]="popupNeedsApply"
    ></app-select>`,
  styles: ``,
  imports: [SelectComponent]
})
export class SelectActivitiesComponent implements OnChanges {
  @Input() value: (TrailActivity | undefined)[] = [];
  @Output() valueChange = new EventEmitter<(TrailActivity | undefined)[]>();

  @Input() separator: string | I18nString = ', ';
  @Input() popupNeedsApply = true;

  _value: (TrailActivity | 'unspecified')[] = [];
  _items: SelectItem<TrailActivity | 'unspecified'>[];
  _groups: SelectGroup[];

  popupTitleKey = ACTIVITIES_POPUP_TITLE_KEY;

  constructor(
    public readonly i18n: I18nService,
  ) {
    const loaded = getActivityItems();
    this._items = loaded.items;
    this._groups = loaded.groups;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value']) {
      this._value = this.value.map(i => i === undefined ? 'unspecified' : i);
    }
  }

  setValue($event: (TrailActivity | 'unspecified')[]): void {
    if (Arrays.sameContent($event, this._value)) return;
    this._value = $event;
    this.value = $event.map(i => i === 'unspecified' ? undefined : i);
    this.valueChange.emit(this.value);
  }
}
