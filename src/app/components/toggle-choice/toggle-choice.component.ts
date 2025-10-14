import { NgStyle } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonToggle } from "@ionic/angular/standalone";

@Component({
    selector: 'app-toggle-choice',
    templateUrl: './toggle-choice.component.html',
    styleUrls: ['./toggle-choice.component.scss'],
    imports: [IonToggle, NgStyle]
})
export class ToggleChoiceComponent<T> {

  @Input() value1!: T;
  @Input() value2!: T;
  @Input() value!: T;
  @Output() valueChanged = new EventEmitter<T>();

  @Input() label1!: string;
  @Input() label2!: string;

  @Input() color = 'primary';

  setValue(value: T): void {
    if (value === this.value) return;
    this.value = value;
    this.valueChanged.emit(value);
  }
}
