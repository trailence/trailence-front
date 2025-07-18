import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { IonInput, IonTextarea, IonButton, IonSpinner } from "@ionic/angular/standalone";
import { TrailTranslations, translationsTargetLanguages } from '../trail-translations';
import { ModerationService } from 'src/app/services/moderation/moderation.service';
import { Trail } from 'src/app/model/trail';
import { FormsModule } from '@angular/forms';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { Console } from 'src/app/utils/console';

@Component({
  selector: 'app-moderation-translations',
  templateUrl: './moderation-translations.component.html',
  styleUrl: './moderation-translations.component.scss',
  imports: [IonSpinner,
    IonTextarea, IonInput,
    FormsModule,
    IonButton
]
})
export class ModerationTranslationsComponent implements OnInit {

  @Input() trail!: Trail;
  @Input() translations!: TrailTranslations;
  @Output() translationsUpdated = new EventEmitter();

  sourceLanguages?: {code: string, name: string}[];
  targetLanguages = translationsTargetLanguages;

  displayTarget?: string;
  detecting = false;
  translating = 0;

  constructor(
    private readonly moderationService: ModerationService,
    private readonly changesDetector: ChangeDetectorRef,
    public readonly i18n: I18nService,
  ) {}

  ngOnInit(): void {
    this.i18n.getTranslationLanguages().subscribe(l => {
      this.sourceLanguages = l.map(e => ({code: e.code, name: e.name}));
      this.changesDetector.detectChanges();
    });
  }

  detectLanguage(): void {
    this.detecting = true;
    this.moderationService.detectLanguage(this.trail.description ?? '')
    .subscribe({
      next: lang => {
        this.detecting = false;
        this.setLanguage(lang);
      },
      error: e => {
        Console.error('Cannot detect language', e);
        this.detecting = false;
        this.changesDetector.detectChanges();
      }
    });
  }

  setLanguage(lang: string): void {
    this.translations.detectedLanguage = lang.length > 0 && (lang === 'fr' || lang === 'en') ? lang : undefined;
    this.translations.nameTranslations = undefined;
    this.translations.descriptionTranslations = undefined;
    let availTargets: string[] = [];
    if (this.translations.detectedLanguage) {
      for (const tl of this.targetLanguages) {
        if (lang === tl.code) continue;
        this.doTranslation(lang, tl.code);
        availTargets.push(tl.code);
      }
    }
    if (availTargets.length === 1) this.displayTarget = availTargets[0];
    this.changesDetector.detectChanges();
    this.translationsUpdated.emit();
  }

  doTranslation(from: string, to: string): void {
    this.translating += 2;
    this.moderationService.translate(this.trail.name ?? '', from, to)
    .subscribe({
      next: translation => {
        this.translations.nameTranslations ??= {};
        this.translations.nameTranslations[to] = translation;
        this.translating--;
        this.changesDetector.detectChanges();
        this.translationsUpdated.emit();
      },
      error: e => {
        this.translating--;
        this.translations.nameTranslations ??= {};
        this.translations.nameTranslations[to] = '';
        this.changesDetector.detectChanges();
      }
    });
    this.moderationService.translate(this.trail.description ?? '', from, to)
    .subscribe({
      next: translation => {
        this.translations.descriptionTranslations ??= {};
        this.translations.descriptionTranslations[to] = translation;
        this.translating--;
        this.changesDetector.detectChanges();
        this.translationsUpdated.emit();
      },
      error: e => {
        this.translating--;
        this.translations.descriptionTranslations ??= {};
        this.translations.descriptionTranslations[to] = '';
        this.changesDetector.detectChanges();
      }
    });
  }

  setDisplayTarget(target: string): void {
    this.displayTarget = target;
    this.changesDetector.detectChanges();
  }

  translationChanged(): void {
    this.translationsUpdated.emit();
  }

}
