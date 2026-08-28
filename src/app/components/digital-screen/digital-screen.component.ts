import { Component, ElementRef, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { DigitalScreenRenderer } from './digital-screen-renderer';

@Component({
  selector: 'app-digital-screen',
  template: ``,
})
export class DigitalScreenComponent implements OnInit, OnChanges {

  @Input() value?: number;
  @Input() maxFractionalDigits?: number;
  @Input() maxDigits?: number;
  @Input() height?: number;

  constructor(
    private readonly elementRef: ElementRef,
  ) {}

  ngOnInit(): void {
    this.update();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.update();
  }

  private update(): void {
    const content = this.value !== undefined ? DigitalScreenRenderer.createDigitalSvg(this.value, this.maxFractionalDigits, this.maxDigits, this.height) : '';
    this.elementRef.nativeElement.innerHTML = content;
  }

}
