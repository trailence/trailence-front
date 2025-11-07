import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { IonIcon, IonButton } from '@ionic/angular/standalone';

@Component({
  selector: 'app-input-number',
  template: `
  <div class="input-container">
    @if (rightIcon) {
      <ion-icon [name]="rightIcon"></ion-icon>
    }
    <input type="number" [step]="step" [min]="min" [max]="max" (change)="inputChangeEvent($event)" [value]="value" style="width: {{inputWidth + 5}}px"/>
    <ion-button fill="clear" color="secondary" size="small" (click)="dec()" [disabled]="value !== undefined && value <= min"><div class="minus"></div></ion-button>
    <ion-button fill="clear" color="secondary" size="small" (click)="inc()" [disabled]="value !== undefined && value >= max"><div class="plus"></div></ion-button>
  </div>
  `,
  styles: `
  :host {
    display: inline-block;
    --border: 1px solid rgba(var(--ion-color-medium-rgb), 0.75);
  }
  div.input-container {
    border: var(--border);
    border-radius: 5px;
    box-sizing: border-box;
    height: 27px;
    display: flex;
    flex-direction: row;

    input {
      border: none;
      -moz-appearance:textfield;
      background: none;
      margin: 2px 4px;
      padding: 0;
      outline: none;
      height: 23px;
    }
    input::-webkit-outer-spin-button, input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    ion-button {
      min-height: 25px;
      margin-top: 0;
      margin-bottom: 0;
      letter-spacing: 0;
      --padding-start: 10px;
      --padding-end: 10px;
    }
    div.minus, div.plus { position: relative; width: 12px; height: 12px; }
    div.minus::after, div.plus::after {
      content: '';
      position: absolute;
      top: calc(50% - 1px);
      left: 0;
      right: 0;
      border-top: 2px solid var(--ion-color-secondary);
    }
    div.plus::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: calc(50% - 1px);
      border-right: 2px solid var(--ion-color-secondary);
    }
  }
  `,
  imports: [
    IonIcon,
    IonButton,
  ]
})
export class InputNumberComponent implements OnChanges {

  @Input() rightIcon?: string;
  @Input() value?: number;
  @Output() valueChange = new EventEmitter<number | undefined>();

  @Input() step = 1;
  @Input() min = 0;
  @Input() max = 1000;

  inputWidth = 100;

  ngOnChanges(changes: SimpleChanges): void {
    this.inputWidth = Math.max(('' + this.min).length, ('' + this.max).length) * 13;
  }

  inputChangeEvent(event: Event): void {
    const val = (event.target as HTMLInputElement | null)?.value;
    if (val !== null && val !== undefined) {
      const v = Number.parseInt(val);
      if (!Number.isNaN(v)) this.setValue(v);
    }
  }

  inc(): void {
    this.setValue(this.value === undefined ? this.min : this.value + this.step);
  }

  dec(): void {
    this.setValue(this.value === undefined ? this.min : this.value - this.step);
  }

  private setValue(newValue: number): void {
    const v = Math.min(this.max, Math.max(this.min, newValue));
    if (v !== this.value) {
      this.value = v;
      this.valueChange.emit(v);
    }
  }

}
