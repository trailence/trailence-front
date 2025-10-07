import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SecurityContext, SimpleChanges } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { distinctUntilChanged, map, skip, Subscription } from 'rxjs';
import { I18nPipe } from 'src/app/services/i18n/i18n-string';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';

@Component({
  selector: 'app-text',
  template: `<div>
    @if (!placeholder || html.length > 0) {
      <span [innerHTML]="html"></span>
    } @else {
      <span class="placeholder">{{placeholder}}</span>
    }
    @if (hasMore) {
      <div class="show-more">
        <a href='#' (click)="toggleMore(); $event.preventDefault(); $event.stopPropagation();">{{ (showFull ? 'show_less' : 'show_more') | i18nString }}</a>
      </div>
    }
    @if (translatedFrom) {
      <div class="translated-from">
        {{ 'translations.translated_from_' + translatedFrom | i18nString }}
        <span class="view-original" (click)="viewOriginal(true)">{{ i18n.texts.translations.view_original }}</span>
      </div>
    } @else if (showOriginal) {
      <div class="translated-from">
        <span class="view-original" (click)="viewOriginal(false)">{{ i18n.texts.translations.view_translated }}</span>
      </div>
    }
  </div>`,
  styles: `
  div.translated-from {
    color: var(--ion-color-medium);
    font-size: 12px;
    span.view-original {
      text-decoration: underline;
      cursor: pointer;
    }
  }
  div.show-more {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    a {
      font-size: 13px;
      color: var(--ion-color-medium);
    }
  }
  span.placeholder {
    font-style: italic;
  }
  `,
  imports: [I18nPipe],
})
export class TextComponent implements OnChanges, OnInit, OnDestroy {

  @Input() text?: string;
  @Input() lang?: string;
  @Input() translations?: {[key: string]: string};
  @Input() placeholder?: string;

  @Input() maxTextLength = 400;
  @Input() minTextEllipsis = 350;

  html = '';
  translatedFrom?: string;
  showOriginal = false;
  langSubscription?: Subscription;
  showFull = false;
  hasMore = false;

  constructor(
    private readonly sanitizer: DomSanitizer,
    private readonly prefs: PreferencesService,
    public readonly i18n: I18nService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.langSubscription = this.prefs.preferences$.pipe(
      map(prefs => prefs.lang),
      skip(1),
      distinctUntilChanged()
    ).subscribe(l => {
      this.showOriginal = false;
      this.translatedFrom = undefined;
      this.update();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.update();
  }

  ngOnDestroy(): void {
    this.langSubscription?.unsubscribe();
  }

  viewOriginal(original: boolean): void {
    this.showOriginal = original;
    this.update();
    this.changeDetector.detectChanges();
  }

  private update(): void {
    if (this.showOriginal || !this.translations || !this.lang || this.lang === this.prefs.preferences.lang || !this.translations[this.prefs.preferences.lang]) {
      this.html = this.sanitizer.sanitize(SecurityContext.HTML, this.getText(this.text)) ?? '';
      this.translatedFrom = undefined;
    } else {
      this.translatedFrom = this.lang;
      this.html = this.sanitizer.sanitize(SecurityContext.HTML, this.getText(this.translations[this.prefs.preferences.lang])) ?? '';
    }
  }

  private getText(text: string | undefined | null): string {
    if (!text) return '';
    let i = 0;
    while ((i = text.indexOf('\n', i)) > 0) {
      const before = text.substring(0, i).toLowerCase().trim();
      if (!before.endsWith('<br/>') && !before.endsWith('<br>') && !before.endsWith('</p>')) {
        text = text.substring(0, i).trim() + '<br/>' + text.substring(i + 1);
      }
      i++;
    }
    if (text.length > this.maxTextLength) {
      this.hasMore = true;
      if (!this.showFull) {
        let pos = this.minTextEllipsis;
        do {
          const previousOpen = text.lastIndexOf('<', this.minTextEllipsis);
          if (previousOpen >= 0) {
            const nextClose = text.indexOf('>', previousOpen);
            if (nextClose >= pos) {
              pos = nextClose + 1;
              continue;
            }
          }
          const isLetter = text.charAt(pos).match(/[a-z]/i);
          if (isLetter && !text.charAt(pos - 1).match(/[a-z]/i)) {
            break;
          }
          if (isLetter) while (text.charAt(++pos).match(/[a-z]/i) && pos < text.length && pos < this.maxTextLength);
          while (!text.charAt(++pos).match(/[a-z]/i) && pos < text.length && pos < this.maxTextLength);
        } while (pos < text.length && pos < this.maxTextLength);
        text = text.substring(0, pos) + ' [...]';
      }
    } else {
      this.hasMore = false;
    }
    return text;
  }

  public toggleMore(): void {
    this.showFull = !this.showFull;
    this.update();
    this.changeDetector.detectChanges();
  }

}
