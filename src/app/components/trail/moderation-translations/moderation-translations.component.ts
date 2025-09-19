import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { IonInput, IonTextarea, IonButton, IonSpinner, AlertController } from "@ionic/angular/standalone";
import { TrailTranslations, translationsTargetLanguages } from '../trail-translations';
import { ModerationService } from 'src/app/services/moderation/moderation.service';
import { Trail } from 'src/app/model/trail';
import { FormsModule } from '@angular/forms';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { Console } from 'src/app/utils/console';
import { Track } from 'src/app/model/track';

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
  @Input() track!: Track;
  @Input() translations!: TrailTranslations;
  @Output() translationsUpdated = new EventEmitter();
  @Output() wayPointsUpdated = new EventEmitter();

  sourceLanguages?: {code: string, name: string}[];
  targetLanguages = translationsTargetLanguages;

  displayTarget?: string;
  detecting = false;
  translating = 0;

  constructor(
    private readonly moderationService: ModerationService,
    private readonly changesDetector: ChangeDetectorRef,
    public readonly i18n: I18nService,
    private readonly alertController: AlertController,
  ) {}

  ngOnInit(): void {
    this.i18n.getTranslationLanguages().subscribe(l => {
      this.sourceLanguages = l.map(e => ({code: e.code, name: e.name}));
      this.changesDetector.detectChanges();
      if (this.trail.publicationData && this.trail.publicationData['lang']) this.setLanguage(this.trail.publicationData['lang']);
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
    this.translations.nameTranslations ??= {};
    this.translations.descriptionTranslations ??= {};
    this.track.wayPoints.forEach(wp => {
      if (wp.name.trim().length > 0) wp.nameTranslations ??= {}; else wp.nameTranslations = undefined;
      if (wp.description.trim().length > 0) wp.descriptionTranslations ??= {}; else wp.descriptionTranslations = undefined;
    });
    if (this.trail.publicationData) {
      if (this.trail.publicationData['nameTranslations'])
        this.translations.nameTranslations = {...this.trail.publicationData['nameTranslations']};
      if (this.trail.publicationData['descriptionTranslations'])
        this.translations.descriptionTranslations = {...this.trail.publicationData['descriptionTranslations']};
    }
    let availTargets: string[] = [];
    if (this.translations.detectedLanguage) {
      for (const tl of this.targetLanguages) {
        if (lang === tl.code) continue;
        availTargets.push(tl.code);
        if (this.translations.nameTranslations![tl.code] === undefined)
          this.translations.nameTranslations![tl.code] = '';
        if (this.translations.descriptionTranslations![tl.code] === undefined)
          this.translations.descriptionTranslations![tl.code] = '';
        this.track.wayPoints.forEach(wp => {
          if (wp.nameTranslations && wp.nameTranslations[tl.code] === undefined) wp.nameTranslations[tl.code] = '';
          if (wp.descriptionTranslations && wp.descriptionTranslations[tl.code] === undefined) wp.descriptionTranslations[tl.code] = '';
        });
      }
    }
    if (availTargets.length === 1) this.displayTarget = availTargets[0];
    this.changesDetector.detectChanges();
    this.translationsUpdated.emit();
  }

  translateName(from: string, to: string): void {
    this.translating++;
    this.changesDetector.detectChanges();
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
        Console.error('Translation error', e);
        this.changesDetector.detectChanges();
      }
    });
  }

  translateDescription(from: string, to: string): void {
    this.translating++;
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
        Console.error('Translation error', e);
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

  wayPointChanged(): void {
    this.wayPointsUpdated.emit();
  }

  getAIPrompt() {
    let prompt = 'Here are information about a hike/trail, that are in language "' + this.translations.detectedLanguage + '", that I need to translate in "' + this.displayTarget + '". Please keep the formatting tags like <strong>, <p>, <br/>...\n\n';
    prompt += '<b>Name</b>:\n' + this.trail.name + '\n\n';
    prompt += '<b>Description</b>:\n' + this.trail.description + '\n\n';
    for (let i = 0; i < this.track.wayPoints.length; ++i) {
      const wp = this.track.wayPoints[i];
      if (wp.name.trim().length > 0 || wp.description.trim().length > 0) {
        prompt += '<b>Way Point ' + i + '</b>:\n';
        if (wp.name.trim().length > 0) {
          prompt += '<b>Name</b>:\n' + wp.name + '\n';
        }
        if (wp.description.trim().length > 0) {
          prompt += '<b>Description</b>:\n' + wp.description + '\n';
        }
        prompt += '\n';
      }
    }
    this.alertController.create({
      header: 'AI Prompt',
      cssClass: 'large',
      inputs: [{
        type: 'textarea',
        value: prompt
      }]
    }).then(a => a.present());
  }

}
