import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SecurityContext, SimpleChanges } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { distinctUntilChanged, map, skip, Subscription } from 'rxjs';
import { I18nPipe } from 'src/app/services/i18n/i18n-string';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';

@Component({
  selector: 'app-text',
  template: `<div>
    <span [innerHTML]="html"></span>
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
  `,
  imports: [I18nPipe],
})
export class TextComponent implements OnChanges, OnInit, OnDestroy {

  @Input() text?: string;
  @Input() lang?: string;
  @Input() translations?: {[key: string]: string};

  html = '';
  translatedFrom?: string;
  showOriginal = false;
  langSubscription?: Subscription;

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
      this.html = this.sanitizer.sanitize(SecurityContext.HTML, this.text?.replace(/\n/g, '<br/>') ?? '') ?? '';
      this.translatedFrom = undefined;
    } else {
      this.translatedFrom = this.lang;
      this.html = this.sanitizer.sanitize(SecurityContext.HTML, this.translations[this.prefs.preferences.lang]?.replace(/\n/g, '<br/>') ?? '') ?? '';
    }
  }

}
