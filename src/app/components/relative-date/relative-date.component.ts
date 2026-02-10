import { Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
  selector: 'app-relative-date',
  template: ``,
  imports: []
})
export class RelativeDateComponent implements OnChanges, OnDestroy {

  @Input() date?: number;
  @Input() forceRelative = false;

  constructor(
    private readonly i18n: I18nService,
    private readonly element: ElementRef,
  ) {}

  private _timeout?: any;

  ngOnChanges(changes: SimpleChanges): void {
    if (this._timeout) clearTimeout(this._timeout);
    this.refresh();
  }

  ngOnDestroy(): void {
    if (this._timeout) clearTimeout(this._timeout);
  }

  private refresh(): void {
    this._timeout = undefined;
    this.element.nativeElement.innerText = this.i18n.timestampToRelativeDate(this.date, this.forceRelative);
    if (this.date) {
      const diff = Date.now() - this.date;
      if (diff < 4 * 60 * 60 * 1000) {
        let nextUpdate;
        if (diff < 10000) nextUpdate = 1000;
        else if (diff < 30000) nextUpdate = 5000;
        else if (diff < 60000) nextUpdate = 10000;
        else nextUpdate = 60000;
        this._timeout = setTimeout(() => this.refresh(), nextUpdate);
      }
    }
  }

}
