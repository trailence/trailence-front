import { Component, Input, OnChanges, SecurityContext, SimpleChanges } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'app-text',
  template: `<span [innerHTML]="html"></span>`,
  imports: [],
})
export class TextComponent implements OnChanges {

  @Input() text?: string;

  html = '';

  constructor(
    private readonly sanitizer: DomSanitizer,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['text'])
      this.html = this.sanitizer.sanitize(SecurityContext.HTML, this.text?.replace(/\n/g, '<br/>') ?? '') ?? '';
  }

}
