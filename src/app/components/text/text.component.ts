import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SecurityContext, SimpleChanges } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { distinctUntilChanged, map, skip, Subscription } from 'rxjs';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { StringUtils } from 'src/app/utils/string-utils';

@Component({
  selector: 'app-text',
  template: `<div>
    @if (!placeholder || html.length > 0) {
      @if (showSource) {
        <span>{{html}}</span>
      } @else {
        <span [innerHTML]="html"></span>
      }
    } @else {
      <span class="placeholder">{{placeholder}}</span>
    }
    @if (hasMore && !showSource) {
      <div class="show-more">
        <a href='#' (click)="toggleMore(); $event.preventDefault(); $event.stopPropagation();">{{ (showFull ? i18n.texts.show_less : i18n.texts.show_more) }}</a>
      </div>
    }
    @if (translatedFrom) {
      <div class="translated-from">
        {{ i18n.texts.translations.translated_from }} {{ i18n.texts.translations.from[translatedFrom] }}
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
  imports: [],
})
export class TextComponent implements OnChanges, OnInit, OnDestroy {

  @Input() text?: string;
  @Input() lang?: string;
  @Input() translations?: {[key: string]: string};
  @Input() placeholder?: string;

  @Input() maxTextLength = 400;
  @Input() minTextEllipsis = 350;

  @Input() showSource = false;

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
    this.langSubscription = this.i18n.langLoaded$.pipe(
      skip(1),
      distinctUntilChanged()
    ).subscribe(() => {
      this.showOriginal = false;
      this.translatedFrom = undefined;
      this.update();
      this.changeDetector.detectChanges();
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

  public getText(text: string | undefined | null): string {
    if (!text) return '';
    if (this.showSource) return text;
    text = TextComponent.replaceBreakLines(text);
    if (text.length > this.maxTextLength) {
      this.hasMore = true;
      if (!this.showFull) {
        text = this.ellipsis(text);
      }
    } else {
      this.hasMore = false;
    }
    return text;
  }

  public static replaceBreakLines(text: string): string {
    let i = 0;
    while ((i = text.indexOf('\n', i)) > 0) {
      const before = text.substring(0, i).toLowerCase().trim();
      if (!before.endsWith('<br/>') && !before.endsWith('<br>') && !before.endsWith('</p>') && !before.endsWith('</ul>') && !before.endsWith('</ol>') && !this.isInsideBulletPoints(before)) {
        const t1 = text.substring(0, i).trim();
        text = t1 + '<br/>' + text.substring(i + 1);
        i = t1.length;
      }
      i++;
    }
    return text;
  }

  private static isInsideBulletPoints(textBefore: string): boolean {
    let ulStart = textBefore.lastIndexOf('<ul');
    let olStart = textBefore.lastIndexOf('<ol');
    if (ulStart < 0 && olStart < 0) return false;
    let isUl = ulStart >= 0 && (olStart < 0 || ulStart > olStart);
    let start = isUl ? ulStart : olStart;
    let end = isUl ? textBefore.indexOf('</ul>', ulStart) : textBefore.indexOf('</ol>', olStart);
    if (end > 0) return false;
    let liStart = textBefore.lastIndexOf('<li', start);
    if (liStart < 0) return true;
    let liEnd = textBefore.indexOf('</li>', liStart);
    if (liEnd < 0) return false;
    return true;
  }

  private ellipsis(text: string): string {
    let pos = this.minTextEllipsis;
    do {
      pos = this.moveOutOfTag(text, pos);
      const isLetter = StringUtils.isWordChar(text.charAt(pos));
      if (isLetter && !StringUtils.isWordChar(text.charAt(pos - 1))) {
        break;
      }
      if (isLetter) while (StringUtils.isWordChar(text.charAt(++pos)) && pos < text.length && pos < this.maxTextLength);
      while (!StringUtils.isWordChar(text.charAt(++pos)) && pos < text.length && pos < this.maxTextLength);
    } while (pos < text.length && pos < this.maxTextLength);
    return text.substring(0, pos) + ' [...]';
  }

  private moveOutOfTag(text: string, pos: number): number {
    const previousOpen = text.lastIndexOf('<', pos);
    if (previousOpen < 0) return pos;
    const nextClose = text.indexOf('>', previousOpen);
    if (nextClose < pos) return pos;
    return nextClose + 1;
  }

  public toggleMore(): void {
    this.showFull = !this.showFull;
    this.update();
    this.changeDetector.detectChanges();
  }

}
