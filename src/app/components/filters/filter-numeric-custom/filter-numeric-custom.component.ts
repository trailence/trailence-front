import { Component, EventEmitter, Input, OnChanges, OnInit, Output, ViewChild } from '@angular/core';
import { FilterNumeric, NumericFilterCustomConfig } from '../filter';
import { IonRange, IonLabel } from '@ionic/angular/standalone';

@Component({
  selector: 'app-filter-numeric-custom',
  templateUrl: './filter-numeric-custom.component.html',
  imports: [
    IonRange, IonLabel
  ]
})
export class FilterNumericCustomComponent implements OnInit, OnChanges {

  @Input() config!: NumericFilterCustomConfig;
  @Input() value!: FilterNumeric | number;
  @Output() valueChange = new EventEmitter<FilterNumeric | number>;

  @Input() minValueLabel?: string;
  @Input() maxValueLabel?: string;

  valueFormatter = (value: number) => this.config.formatter(this.getValueFromIndex(value));
  ionValue: number | { lower: number, upper: number } = 0;
  @ViewChild('range') ionRange?: IonRange;

  ngOnInit(): void {
    this.refresh();
  }

  ngOnChanges(): void {
    this.refresh();
  }

  getValueFromIndex(index: number): number {
    if (index < 0) return this.config.values[0];
    if (index >= this.config.values.length) return this.config.values[this.config.values.length - 1];
    return this.config.values[index];
  }

  getRealValueFromIndex(index: number): number {
    if (!this.config.realValues) return this.getValueFromIndex(index);
    if (index < 0) return this.config.realValues[0];
    if (index >= this.config.realValues.length) return this.config.realValues[this.config.realValues.length - 1];
    return this.config.realValues[index];
  }

  getIndexFromValue(value: number): number {
    for (let i = 0; i < this.config.values.length; ++i) {
      if (value <= this.config.values[i]) return i;
    }
    return this.config.values[this.config.values.length - 1];
  }

  getIndexFromRealValue(value: number): number {
    if (!this.config.realValues) return this.getIndexFromValue(value);
    for (let i = 0; i < this.config.realValues.length; ++i) {
      if (value <= this.config.realValues[i]) return i;
    }
    return this.config.realValues[this.config.realValues.length - 1];
  }

  private refresh(): void {
    if (typeof this.value === 'number') this.ionValue = this.getIndexFromRealValue(this.value);
    else this.ionValue = { lower: this.value.from !== undefined ? this.getIndexFromRealValue(this.value.from) : 0, upper: this.value.to !== undefined ? this.getIndexFromRealValue(this.value.to) : this.config.values.length - 1 };
    this.valueFormatter = (value: number) => this.config.formatter(this.getValueFromIndex(value))
  }

  ionValueChanged(value: number | { lower: number, upper: number }): void {
    this.ionValue = value;
    if (typeof value === 'number') {
      const newValue = this.getRealValueFromIndex(value);
      if (newValue === this.value) return;
      this.value = newValue;
    } else {
      const newValue = { from: this.getRealValueFromIndex(value.lower), to: this.getRealValueFromIndex(value.upper) };
      if (typeof this.value !== 'number' && newValue.from === this.value.from && newValue.to === this.value.to) return;
      this.value = newValue;
    };
    this.valueChange.emit(this.value);
  }

}