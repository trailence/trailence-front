import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonRange, IonLabel } from "@ionic/angular/standalone";

export interface NumericFilterValueEvent {
  valueMin: number;
  valueMax: number;
  min: number;
  max: number;
}

@Component({
  selector: 'app-filter-numeric',
  templateUrl: './filter-numeric.component.html',
  styleUrls: [],
  standalone: true,
  imports: [IonLabel, IonRange, FormsModule ]
})
export class FilterNumericComponent {

  @Input() minValue!: number;
  @Input() maxValue!: number;
  @Input() valueFormatter!: (value: number) => string;
  @Input() step = 1;
  @Input() minValueLabel?: string;
  @Input() maxValueLabel?: string;

  @Input() selectedMinValue!: number;
  @Input() selectedMaxValue!: number;

  @Output() selectionChange = new EventEmitter<NumericFilterValueEvent>();

  fireValueChange($event: any): void {
    if (this.selectedMinValue === $event.lower && this.selectedMaxValue === $event.upper) return;
    this.selectedMinValue = $event.lower;
    this.selectedMaxValue = $event.upper;
    this.selectionChange.emit({
      valueMin: this.selectedMinValue,
      valueMax: this.selectedMaxValue,
      min: this.minValue,
      max: this.maxValue,
    })
  }

}
