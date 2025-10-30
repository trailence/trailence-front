import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { IonInput, IonTextarea, IonButton, IonSpinner, IonIcon, AlertController } from "@ionic/angular/standalone";
import { ModerationService } from 'src/app/services/moderation/moderation.service';
import { Trail } from 'src/app/model/trail';
import { FormsModule } from '@angular/forms';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { Console } from 'src/app/utils/console';
import { Track } from 'src/app/model/track';
import { TrailService } from 'src/app/services/database/trail.service';
import { ErrorService } from 'src/app/services/progress/error.service';

@Component({
  selector: 'app-moderation-translations',
  templateUrl: './moderation-translations.component.html',
  styleUrl: './moderation-translations.component.scss',
  imports: [
    IonSpinner, IonTextarea, IonInput, IonIcon,
    FormsModule,
    IonButton
]
})
export class ModerationTranslationsComponent implements OnInit, OnChanges {

  @Input() trail!: Trail;
  @Input() track!: Track;
  @Output() translationsReady = new EventEmitter<boolean>();

  sourceLanguages?: {code: string, name: string}[];
  targetLanguages = [
    { code: 'fr', name: 'Français' },
    { code: 'en', name: 'English' },
  ];

  displayTarget?: string;
  detecting = false;
  translating = 0;
  collapsed = true;
  ready?: boolean;

  srcLang?: string = undefined;
  nameTranslation?: string = undefined;
  descriptionTranslation?: string = undefined;
  waypointsTranslation: {name?:string, description?:string}[] = [];

  constructor(
    private readonly moderationService: ModerationService,
    private readonly changesDetector: ChangeDetectorRef,
    public readonly i18n: I18nService,
    private readonly alertController: AlertController,
    private readonly trailService: TrailService,
    private readonly errorService: ErrorService,
  ) {}

  ngOnInit(): void {
    this.i18n.getTranslationLanguages().subscribe(l => {
      this.sourceLanguages = l.map(e => ({code: e.code, name: e.name}));
      this.changesDetector.detectChanges();
      this.populate();
      this.checkReady();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.populate();
    this.checkReady();
  }

  private checkReady(): void {
    const r = this.isReady();
    if (this.ready !== r) {
      this.ready = r;
      this.translationsReady.emit(r);
    }
  }

  private isReady(): boolean {
    if (!this.trail || !this.track) return false;
    if (!this.sourceLanguages) return false;
    const source = this.trail.publicationData?.['lang'];
    if (!source) return false;
    const names = this.trail.publicationData?.['nameTranslations'];
    if (!names) return false;
    const descriptions = this.trail.publicationData?.['descriptionTranslations'];
    if (!descriptions) return false;
    for (const tl of this.targetLanguages) {
      if (tl.code === source) continue;
      if (!names[tl.code] || names[tl.code].trim().length === 0) return false;
      if (!descriptions[tl.code] || descriptions[tl.code].trim().length === 0) return false;
      for (const wp of this.track.wayPoints) {
        if (wp.name.trim().length > 0 && (wp.nameTranslations?.[tl.code] ?? '').trim().length === 0) return false;
        if (wp.description.trim().length > 0 && (wp.descriptionTranslations?.[tl.code] ?? '').trim().length === 0) return false;
      }
    }
    return true;
  }

  private populate(): void {
    if (!this.trail) return;
    this.srcLang = this.trail.publicationData?.['lang'];
    this.checkDisplayTarget();
    if (!this.srcLang || !this.displayTarget) {
      this.nameTranslation = undefined;
      this.descriptionTranslation = undefined;
      this.waypointsTranslation = [];
      return;
    }
    this.nameTranslation = this.trail.publicationData?.['nameTranslations']?.[this.displayTarget] ?? '';
    this.descriptionTranslation = this.trail.publicationData?.['descriptionTranslations']?.[this.displayTarget] ?? '';
    this.waypointsTranslation = [];
    if (!this.track) return;
    for (const wp of this.track.wayPoints) {
      this.waypointsTranslation.push({
        name: wp.name.trim().length > 0 ? wp.nameTranslations?.[this.displayTarget] ?? '' : undefined,
        description: wp.description.trim().length > 0 ? wp.descriptionTranslations?.[this.displayTarget] ?? '' : undefined,
      });
    }
  }

  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.changesDetector.detectChanges();
  }

  setSrcLang(lang: string): void {
    if (lang === this.srcLang) return;
    this.srcLang = lang;
    this.updateTrail(t => {
      t.publicationData ??= {};
      t.publicationData['lang'] = lang;
    });
    this.checkDisplayTarget();
  }

  private checkDisplayTarget(): void {
    if (!this.srcLang) return;
    const neededLanguages = this.targetLanguages.filter(tl => tl.code !== this.srcLang);
    if (this.displayTarget && !neededLanguages.some(tl => tl.code === this.displayTarget)) this.displayTarget = undefined;
    if (neededLanguages.length === 1) this.displayTarget = neededLanguages[0].code;
  }

  detectLanguage(): void {
    if (!this.trail.description || this.trail.description.trim().length === 0) return;
    this.detecting = true;
    this.moderationService.detectLanguage(this.trail.description)
    .subscribe({
      next: lang => {
        this.detecting = false;
        this.setSrcLang(lang);
      },
      error: e => {
        Console.error('Cannot detect language', e);
        this.detecting = false;
        this.changesDetector.detectChanges();
      }
    });
  }

  setDisplayTarget(target?: string): void {
    if (target?.length === 0) target = undefined;
    if (target === this.displayTarget) return;
    if (target === this.srcLang) return;
    if (!this.targetLanguages.some(tl => tl.code === target)) return;
    this.displayTarget = target;
    this.populate();
    this.changesDetector.detectChanges();
  }

  nameTranslationChanged(): void {
    const lang = this.displayTarget;
    const newName = this.nameTranslation;
    if (!lang) return;
    if (this.trail.publicationData?.['nameTranslations']?.[lang] !== newName) {
      this.updateTrail(t => {
        t.publicationData ??= {};
        t.publicationData['nameTranslations'] ??= {};
        t.publicationData['nameTranslations'][lang] = newName;
      });
    }
  }

  descriptionTranslationChanged(): void {
    const lang = this.displayTarget;
    const newDescription = this.descriptionTranslation;
    if (!lang) return;
    if (this.trail.publicationData?.['descriptionTranslations']?.[lang] !== newDescription) {
      this.updateTrail(t => {
        t.publicationData ??= {};
        t.publicationData['descriptionTranslations'] ??= {};
        t.publicationData['descriptionTranslations'][lang] = newDescription;
      });
    }
  }

  private _savingWaypoint = false;
  wayPointChanged(): void {
    if (this._savingWaypoint) return;
    this._savingWaypoint = true;
    const translations = this.waypointsTranslation.map(wp => ({...wp}));
    const lang = this.displayTarget;
    if (!lang) return;
    this.save(() => {
      for (let i = 0; i < this.track.wayPoints.length; ++i) {
        const wp = this.track.wayPoints[i];
        const tr = translations.at(i);
        if (!tr) continue;
        if (tr.name !== undefined) {
          wp.nameTranslations ??= {};
          wp.nameTranslations[lang] = tr.name;
        }
        if (tr.description !== undefined) {
          wp.descriptionTranslations ??= {};
          wp.descriptionTranslations[lang] = tr.description;
        }
      }
      this._savingWaypoint = false;
      const newTrack = this.track.copy(this.track.owner);
      this.moderationService.updateTrack(this.trail, newTrack).subscribe({
        next: () => {
          this.saveDone();
        },
        error: e => {
          Console.error('Error updating track from moderation', e);
          this.errorService.addNetworkError(e, 'publications.moderation.error_updating_trail', []);
          this.saveDone();
        }
      });
    });
  }

  private updateTrail(updater: (trail: Trail) => void): void {
    this.save(() => this.trailService.doUpdate(this.trail, updater, () => this.saveDone()));
  }

  private _saveQueue: (() => void)[] = [];
  private _saveTimeout: any;
  private save(operation: () => void): void {
    this._saveQueue.push(operation);
    if (this._saveQueue.length === 1) {
      this.saveDone();
    } else {
      this.changesDetector.detectChanges();
    }
  }
  private saveDone(): void {
    if (this._saveQueue.length > 0 && !this._saveTimeout) {
      this._saveTimeout = setTimeout(() => {
        this._saveTimeout = undefined;
        if (this._saveQueue.length > 0)
          this._saveQueue.splice(0, 1)[0]();
      }, 1);
    }
    if (this._saveQueue.length === 0) this.checkReady();
    this.changesDetector.detectChanges();
  }

  clearAllTranslations(): void {
    if (!this.displayTarget) return;
    this.nameTranslation = '';
    this.descriptionTranslation = '';
    this.nameTranslationChanged();
    this.descriptionTranslationChanged();
    for (const wp of this.waypointsTranslation) {
      if (wp.name !== undefined) wp.name = '';
      if (wp.description !== undefined) wp.description = '';
    }
    this.wayPointChanged();
  }

  getAIPrompt(): string {
    if (!this.displayTarget) return '';
    let prompt = '';
    // who are you
    prompt += 'You are an expert translator of hiking and outdoor guides\n';
    // what is your task
    prompt += 'Source: ' + this.srcLang + '\n';
    prompt += 'Target: ' + this.displayTarget + '\n';
    prompt += 'Translate the hiking sheet below according to these rules\n\n';
    // rules
    prompt += '## Translation\n\n'
    prompt += ' * Translate faithfully, keeping the **same tone** and style\n';
    prompt += ' * Prefer terms commonly used in hiking and outdoor guidebooks\n';
    prompt += ' * Write naturally and fluently, not literally, but faithfully\n';
    prompt += ' * Keep proper nouns, trail and place names unchanged unless a standard translation exists\n';
    prompt += '\n';
    prompt += '## Formatting\n\n';
    prompt += ' * Input is in **HTML**\n';
    prompt += ' * Do **not** change, remove or add HTML tags (`<p>`, `<b>`, `<i>`, `<br>`, etc.)\n';
    prompt += ' * Output must stay **valid HTML** with the same structure\n';
    prompt += ' * Return **only** the translated HTML — no explanations, markdown, code blocks, or extra text\n';
    prompt += ' * The `name` attribute in `<hikeSection>` tags **MUST NOT** be translated\n';
    prompt += '\n';
    prompt += '# Hiking sheet\n\n';
    // the content
    if (!this.trail.publicationData?.['nameTranslations']?.[this.displayTarget]?.trim()?.length)
      prompt += '<hikeSection name="trail name">' + this.trail.name + '</hikeSection>\n';
    if (!this.trail.publicationData?.['descriptionTranslations']?.[this.displayTarget]?.trim()?.length)
      prompt += '<hikeSection name="trail description">' + this.trail.description + '</hikeSection>\n';
    for (let i = 0; i < this.track.wayPoints.length; ++i) {
      const wp = this.track.wayPoints[i];
      const tr = this.waypointsTranslation.at(i);
      if (wp.name.trim().length > 0 || wp.description.trim().length > 0) {
        if (wp.name.trim().length > 0 && !tr?.name?.trim()?.length) {
          prompt += '<hikeSection name="waypoint name ' + i + '">' + wp.name + '</hikeSection>\n';
        }
        if (wp.description.trim().length > 0 && !tr?.description?.trim()?.length) {
          prompt += '<hikeSection name="waypoint description ' + i + '">' + wp.description + '</hikeSection>\n';
        }
      }
    }
    return prompt;
  }

  showAIPrompt(): void {
    this.alertController.create({
      header: 'AI Prompt',
      cssClass: 'large',
      inputs: [{
        type: 'textarea',
        value: this.getAIPrompt(),
      }]
    }).then(a => a.present());
  }


  translateWithAI(): void {
    this.translating++;
    this.changesDetector.detectChanges();
    this.moderationService.translateWithAI(this.getAIPrompt())
    .subscribe({
      next: response => {
        this.fillWithAIResponse(response, this.displayTarget!);
        this.translating--;
        this.changesDetector.detectChanges();
      },
      error: e => {
        this.errorService.addNetworkError(e, 'publications.moderation.error_translating', []);
        this.translating--;
        this.changesDetector.detectChanges();
      }
    });
  }

  private fillWithAIResponse(response: string, target: string): void {
    const result = this.parseAIResponse(response);
    if (!this.nameTranslation?.length && result['trail name']) {
      this.nameTranslation = result['trail name'];
      this.nameTranslationChanged();
    }
    if (!this.descriptionTranslation?.length && result['trail description']) {
      this.descriptionTranslation = result['trail description'];
      this.descriptionTranslationChanged();
    }
    let waypointsChange = false;
    for (let i = 0; i < this.track.wayPoints.length; ++i) {
      const wp = this.waypointsTranslation.at(i);
      if (!wp) continue;
      if (wp.name !== undefined && wp.name.length === 0 && result['waypoint name ' + i]) {
        wp.name = result['waypoint name ' + i];
        waypointsChange = true;
      }
      if (wp.description !== undefined && wp.description.length === 0 && result['waypoint description ' + i]) {
        wp.description = result['waypoint description ' + i];
        waypointsChange = true;
      }
    }
    if (waypointsChange) this.wayPointChanged();
  }

  private parseAIResponse(response: string): {[key: string]: string} {
    let pos = 0;
    const result: {[key: string]: string} = {};
    do {
      let start = response.indexOf('<hikeSection name="', pos);
      if (start < 0) break;
      let i = response.indexOf('">', start + 19);
      if (i < 0) break;
      const name = response.substring(start + 19, i);
      pos = i + 2;
      start = response.indexOf('</hikeSection>', pos);
      if (start < 0) break;
      const value = response.substring(pos, start);
      pos = start + 14;
      result[name] = value;
    } while (pos < response.length);
    return result;
  }

}
