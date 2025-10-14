import { Directive, ElementRef, HostListener, Input, OnChanges, OnInit, SecurityContext, SimpleChanges } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { I18nString } from 'src/app/services/i18n/i18n-string';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { HtmlUtils } from 'src/app/utils/html-utils';
import { Resubscribeables } from 'src/app/utils/rxjs/subscription-utils';

@Directive({
  selector: '[appTooltip]'
})
export class TooltipDirective implements OnInit, OnChanges {

  @Input() appTooltip!: string;

  constructor(
    private readonly element: ElementRef,
    private readonly sanitizer: DomSanitizer,
  ) {}

  private handler?: TooltipHandler;

  ngOnInit(): void {
    this.handler = new TooltipHandler(this.element.nativeElement, this.sanitizer.sanitize(SecurityContext.HTML, this.appTooltip) ?? '');
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['appTooltip'] && this.handler)
      this.handler.html = this.sanitizer.sanitize(SecurityContext.HTML, this.appTooltip) ?? '';
  }

  @HostListener('mouseenter') mouseEnter(): void { this.handler?.mouseEnter(); }
  @HostListener('mouseleave') mouseLeave(): void { this.handler?.mouseLeave(); }
  @HostListener('click', ['$event']) click(event: PointerEvent): void { this.handler?.click(event); }

}

class TooltipHandler {

  constructor(
    private readonly element: HTMLElement,
    public html: string,
  ) {}

  private shown?: HTMLDivElement;
  private fromMouseHover = false;

  public mouseEnter(): void {
    if (this.shown) return;
    this.fromMouseHover = true;
    this.showTooltip();
  }

  public mouseLeave(): void {
    if (!this.shown || !this.fromMouseHover) return;
    this.fromMouseHover = false;
    this.hideTooltip();
  }

  public click(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.showTooltip();
  }

  showTooltip(): void {
    if (this.shown) return;
    const pos = HtmlUtils.getPositionInPage(this.element);
    this.shown = document.createElement('DIV') as HTMLDivElement;
    this.shown.classList.add('app-tooltip');
    this.shown.innerHTML = this.html;
    document.body.appendChild(this.shown);
    const tooltipHeight = this.shown.offsetHeight;
    const tooltipWidth = this.shown.offsetWidth;
    const elementHeight = this.element.offsetHeight;
    const elementWidth = this.element.offsetWidth;
    const pageHeight = document.documentElement.offsetHeight;
    const pageWidth = document.documentElement.offsetWidth;
    if (tooltipHeight < pos.y) {
      // fit on top
      this.shown.style.top = (pos.y - tooltipHeight) + 'px';
      if (tooltipWidth / 2 < pos.x) {
        // fit center
        this.shown.style.left = (pos.x - tooltipWidth / 2 + elementWidth / 2) + 'px';
      } else {
        this.shown.style.left = '6px';
      }
    }
    else if (pos.y + elementHeight + tooltipHeight < pageHeight) {
      // fit on bottom
      this.shown.style.top = (pos.y + elementHeight) + 'px';
      if (tooltipWidth / 2 < pos.x) {
        // fit center
        this.shown.style.left = (pos.x - tooltipWidth / 2 + elementWidth / 2) + 'px';
      } else {
        this.shown.style.left = '6px';
      }
    }
    else {
      // will go on left or right if possible
      this.shown.style.top = '6px';
      if (tooltipWidth < pos.x) {
        // fit on left
        this.shown.style.left = (pos.x - tooltipWidth) + 'px';
      } else if (pos.x + elementWidth + tooltipWidth < pageWidth) {
        // fit on right
        this.shown.style.left = (pos.x + elementWidth) + 'px';
      } else {
        this.shown.style.left = (pageWidth - tooltipWidth - 6) + 'px';
      }
    }
  }

  hideTooltip(): void {
    if (!this.shown) return;
    this.shown.remove();
    this.shown = undefined;
  }

}

export function addTooltip(element: HTMLElement, i18n: I18nString, i18nService: I18nService, subscriptions: Resubscribeables): void {
  const handler = new TooltipHandler(element, '');
  subscriptions.subscribe(i18nService.translateValue$(i18n), text => handler.html = text);
  element.addEventListener('mouseenter', () => handler.mouseEnter());
  element.addEventListener('mouseleave', () => handler.mouseLeave());
  element.addEventListener('click', event => handler.click(event));
}
