import { Component, ElementRef, Input, OnChanges, OnInit } from '@angular/core';

@Component({
  selector: 'app-svg-container',
  template: ``,
  styles: ``,
  imports: [],
})
export class SvgContainerComponent implements OnInit, OnChanges {

  @Input() svg?: SVGSVGElement;
  @Input() width?: number;
  @Input() height?: number;

  constructor(
    private readonly element: ElementRef,
  ) {}

  ngOnInit(): void {
    this.update();
  }

  ngOnChanges(): void {
    this.update();
  }

  private update(): void {
    while (this.element.nativeElement.childNodes.length > 0) this.element.nativeElement.childNodes[0].remove();
    if (this.svg) {
      if (this.width && this.height) {
        this.svg.setAttribute('width', this.width + 'px');
        this.svg.setAttribute('height', this.height + 'px');
      }
      this.element.nativeElement.appendChild(this.svg);
    }
  }

}
