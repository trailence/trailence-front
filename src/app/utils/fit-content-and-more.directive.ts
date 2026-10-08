import { Directive, ElementRef, Input, NgZone, OnChanges } from '@angular/core';
import { Arrays } from './arrays';

@Directive({
  selector: '[fitContentAndMore]'
})
export class FitContentAndMoreDirective implements OnChanges {

  @Input() fitContentAndMore?: any[];
  @Input() elementRenderer?: (element: any, index: number, nbElement: number) => HTMLElement;
  @Input() moreRenderer?: (nbMore: number) => HTMLElement;

  constructor(
    private readonly el: ElementRef,
    private readonly ngZone: NgZone,
  ) {}

  ngOnChanges(): void {
    this.update();
  }

  _previousElements: any[] = [];

  private update(): void {
    if (this.fitContentAndMore === undefined || this.elementRenderer === undefined || this.moreRenderer === undefined) return;
    if (Arrays.equals(this._previousElements, this.fitContentAndMore)) return; // TODO if resized
    this._previousElements = [...this.fitContentAndMore];
    this.render(Date.now(), false);
  }

  private render(start: number, contentSet: boolean): void {
    if (this.fitContentAndMore === undefined || this.elementRenderer === undefined || this.moreRenderer === undefined) return;
    const container = this.el.nativeElement as HTMLElement;
    let elements: HTMLElement[] | undefined;
    if (!contentSet) {
      while (container.children.length > 0) container.children.item(0)?.remove();
      elements = [];
      const nb = this._previousElements.length;
      for (let i = 0; i < nb; ++i) {
        const element = this._previousElements[i];
        const html = this.elementRenderer(element, i, nb);
        elements.push(html);
        container.appendChild(html);
      }
    }
    const availableWidth = container.offsetWidth;
    if (availableWidth === 0 && this._previousElements.length > 0) {
      if (Date.now() - start > 10000) return;
      this.ngZone.runOutsideAngular(() => {
        requestAnimationFrame(() => {
          this.render(start, true);
        });
      });
      return;
    }
    if (container.scrollWidth <= availableWidth) return;
    if (elements === undefined) {
      elements = [];
      for (let i = 0; i < container.children.length; ++i) elements.push(container.children.item(i) as HTMLElement);
    }
    let more: HTMLElement | undefined = undefined;
    elements[0].style.maxWidth = '';
    elements[0].style.overflow = '';
    for (let i = elements.length - 1; i >= 0; --i) {
      more?.remove();
      if (i === 0) {
        // latest
        if (elements.length > 1) {
          more = this.moreRenderer(elements.length - 1);
          container.appendChild(more);
          elements[0].style.maxWidth = 'calc(100% - ' + more.offsetWidth + 'px)';
          elements[0].style.overflow = 'hidden';
        }
        break;
      }
      elements[i].remove();
      more = this.moreRenderer(elements.length - i);
      container.appendChild(more);
      if (container.scrollWidth <= availableWidth) break;
    }
  }

}
