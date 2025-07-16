import { AfterViewInit, Directive, ElementRef, EventEmitter, Input, NgZone, Output } from '@angular/core';
import { GestureController } from '@ionic/angular/standalone';

@Directive({
  selector: '[long-press]',
})
export class LongPressDirective implements AfterViewInit {

  @Input() longPressDelay = 1500;
  @Input() doubleClickThreshold = 500;
  @Input() allowDoubleClick = true;

  @Output() onPress = new EventEmitter();

  private lastPressAt?: number;
  private timeout: any;

  constructor(
    private readonly el: ElementRef,
    private readonly gestureController: GestureController,
    private readonly ngZone: NgZone,
  ) {}

  ngAfterViewInit(): void {
    const gesture = this.gestureController.create({
      el: this.el.nativeElement,
      threshold: 0,
      gestureName: 'long-press',
      onStart: () => this.onStart(),
      onEnd: () => this.onEnd(),
    });
    gesture.enable(true);
  }

  private onStart(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
    const now = Date.now();
    if (this.lastPressAt && (now - this.lastPressAt) < this.doubleClickThreshold && this.allowDoubleClick) {
      this.emit();
      return;
    }
    this.timeout = setTimeout(() => {
      this.timeout = undefined;
      this.emit();
    }, this.longPressDelay);
  }

  private onEnd(): void {
    this.lastPressAt = Date.now();
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  }

  private emit(): void {
    this.lastPressAt = undefined;
    this.ngZone.run(() => this.onPress.emit());
  }
}
