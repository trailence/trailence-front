import { NgStyle } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { GestureController, Gesture, GestureDetail } from '@ionic/angular/standalone';

export interface RangeValue {
  lower: number;
  upper: number;
}

@Component({
  selector: 'app-range',
  templateUrl: './range.component.html',
  styleUrl: './range.component.scss',
  imports: [
    NgStyle,
  ]
})
export class RangeComponent implements AfterViewInit, OnDestroy {

  @Input() min = 0;
  @Input() max = this.min + 1;
  @Input() value: RangeValue = { lower: this.min, upper: this.max };
  @Input() step = 1;

  @Input() size?: number;
  @Input() direction: 'horizontal' | 'vertical' = 'horizontal';
  @Input() disabledColor = 'medium';
  @Input() enabledColor = 'primary';
  @Input() knobSize = 16;
  @Input() knobRadius = 8;
  @Input() disabledLineHeight = 2;
  @Input() enabledLineHeight = 3;
  @Input() height = 40;

  @Output() valueChange = new EventEmitter<RangeValue>();

  @ViewChild('startKnob') startKnob!: ElementRef;
  @ViewChild('endKnob') endKnob!: ElementRef;
  startGesture?: Gesture;
  endGesture?: Gesture;

  constructor(
    private readonly gestureController: GestureController,
    private readonly elementRef: ElementRef,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

  ngAfterViewInit(): void {
    if (!this.startGesture)
      this.startGesture = this.createGesture(this.startKnob.nativeElement, true);
    if (!this.endGesture)
      this.endGesture = this.createGesture(this.endKnob.nativeElement, false);
  }

  ngOnDestroy(): void {
    this.startGesture?.destroy();
    this.endGesture?.destroy();
  }

  private createGesture(element: HTMLElement, isStart: boolean): Gesture {
    let startValue: number | undefined;
    let size: number | undefined;
    const applyDelta = (e: GestureDetail) => {
      if (startValue === undefined || size === undefined) return;
      const delta = this.direction === 'horizontal' ? e.deltaX : e.deltaY;
      const deltaValue = delta * (this.max - this.min) / size;
      let newValue = startValue + deltaValue;
      newValue = this.step * (newValue / this.step);
      let v: RangeValue | undefined = undefined;
      if (isStart) {
        if (newValue < this.min) newValue = this.min;
        if (newValue > this.value.upper) newValue = this.value.upper;
        if (this.value.lower !== newValue) v = {lower: newValue, upper: this.value.upper};
      } else {
        if (newValue > this.max) newValue = this.max;
        if (newValue < this.value.lower) newValue = this.value.lower;
        if (this.value.upper !== newValue) v = {lower: this.value.lower, upper: newValue};
      }
      if (v) {
        this.value = v;
        this.changeDetector.detectChanges();
        this.valueChange.emit({...v});
      }
    };
    const gesture = this.gestureController.create({
      el: element,
      gestureName: 'knob',
      direction: this.direction === 'horizontal' ? 'x' : 'y',
      threshold: 1,
      onStart: e => {
        startValue = isStart ? this.value.lower : this.value.upper;
        size = this.size || (this.direction === 'horizontal' ? this.elementRef.nativeElement.offsetWidth : this.elementRef.nativeElement.offsetHeight);
        applyDelta(e);
      },
      onMove: e => {
        applyDelta(e);
      },
      onEnd: e => {
        applyDelta(e);
        startValue = undefined;
      }
    });
    gesture.enable();
    return gesture;
  }

}
