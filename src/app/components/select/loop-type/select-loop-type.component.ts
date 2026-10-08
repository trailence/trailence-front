import { Component, EventEmitter, Input, Output } from '@angular/core';
import { getLoopTypeIcon, TrailLoopType } from '@trailence/model/dto/trail-loop-type';
import { SelectItem } from '../select.interface';
import { SelectComponent } from '../select.component';
import { TranslatedString } from '@trailence/services/i18n/i18n-string';

const ITEMS = Object.values(TrailLoopType).map(type => ({
  value: type,
  labelI18n: 'loopType.' + type,
  icon: getLoopTypeIcon(type),
}) as SelectItem<TrailLoopType>);

@Component({
  selector: 'app-select-loop-type',
  template: `
    <app-select
      [items]="items"
      [multiple]="multiple"
      [noneMeansAll]="true"
      allKey="select.loopType.all"
      [separator]="separator"
      popupTitleKey="select.loopType.title"
      [popupNeedsApply]="popupNeedsApply"
      [selection]="selection"
      (selectionChange)="selectionChange.emit($event)"
    ></app-select>
  `,
  styles: ``,
  imports: [
    SelectComponent,
  ]
})
export class SelectLoopTypeComponent {

  @Input() multiple = false;
  @Input() popupNeedsApply = true;

  @Input() selection: TrailLoopType[] = [];
  @Output() selectionChange = new EventEmitter<TrailLoopType[]>();

  items = ITEMS;
  separator = new TranslatedString('select.loopType.or');

}
