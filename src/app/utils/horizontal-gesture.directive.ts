import { Directive, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { Gesture, GestureController, GestureDetail } from '@ionic/angular/standalone';

@Directive({
  selector: '[horizontalGesture]'
})
export class HorizontalGestureDirective implements OnDestroy, OnChanges {

  @Input() horizontalGesture: boolean = true;
  @Input() horizontalGestureThreshold: number = 5;
  @Input() horizontalGestureMinimum: number = 20;
  @Output() horizontalGesturePerformed = new EventEmitter<any>();

  private gesture?: Gesture;
  private readonly mouseDownListener = (e: MouseEvent) => e.preventDefault();

  constructor(
    private readonly el: ElementRef,
    private readonly gestureController: GestureController,
  ) {
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['horizontalGesture']) {
      this.gesture?.destroy();
      this.gesture = undefined;
      this.el.nativeElement.removeEventListener('mousedown', this.mouseDownListener);
      this.el.nativeElement.removeEventListener('touchdown', this.mouseDownListener);
      if (changes['horizontalGesture'].currentValue) {
        this.el.nativeElement.style.position = 'relative';
        this.el.nativeElement.style.left = '0px';
        this.el.nativeElement.addEventListener('mousedown', this.mouseDownListener);
        this.el.nativeElement.addEventListener('touchdown', this.mouseDownListener);
        this.gesture = this.gestureController.create({
          el: this.el.nativeElement,
          threshold: this.horizontalGestureThreshold,
          direction: 'x',
          gestureName: 'photos-slider',
          onMove: detail => this.onMove(detail),
          onEnd: detail => this.onEnd(detail),
          onStart: detail => this.onStart(detail),
          passive: false,
        }, true);
        this.gesture.enable();
      }
    }
  }

  ngOnDestroy(): void {
    this.gesture?.destroy();
    this.el.nativeElement.removeEventListener('mousedown', this.mouseDownListener);
    this.el.nativeElement.removeEventListener('touchdown', this.mouseDownListener);
  }

  private onStart(detail: GestureDetail): void {
    detail.event.stopPropagation();
    detail.event.preventDefault();
  }

  private onMove(detail: GestureDetail): void {
    this.el.nativeElement.style.left = Math.max(0, detail.currentX - detail.startX) + 'px';
    detail.event.stopPropagation();
    detail.event.preventDefault();
  }

  private onEnd(detail: GestureDetail): void {
    detail.event.stopPropagation();
    detail.event.preventDefault();
    this.el.nativeElement.style.left = '0px';
    if (detail.currentX - detail.startX >= this.horizontalGestureMinimum) {
      this.horizontalGesturePerformed.emit(true);
    }
  }
}
