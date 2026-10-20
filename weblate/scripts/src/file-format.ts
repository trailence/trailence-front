import fs from 'node:fs';
import { findI18nFile } from './trailence';
import { Language, LANGUAGES } from './languages';

export interface TranslationMetadata {
  explanation?: string;
}

export abstract class ToWeblate {

  public abstract start(): void;
  public abstract addTranslation(path: string, english: string, target: string | undefined, metadata: TranslationMetadata | undefined): void;
  public abstract end(): void;

  constructor(
    protected readonly trailenceI18nDir: string,
    protected readonly targetLanguage: Language,
    protected readonly targetFilename: string,
  ) {}

  private _leafCount = 0;

  public generate(): void {
    const english = JSON.parse(fs.readFileSync(findI18nFile(this.trailenceI18nDir, 'en'), { encoding: 'utf-8' }));
    let target: any;
    if (this.targetLanguage.trailenceCode === 'en') {
      target = english;
    } else {
      try {
        target = JSON.parse(fs.readFileSync(findI18nFile(this.trailenceI18nDir, this.targetLanguage.trailenceCode), { encoding: 'utf-8' }));
      } catch (e) {
        console.warn('Target not found, generating empty');
      }
    }
    console.log('Generating translation file for ' + this.targetLanguage.trailenceCode);
    this.start();
    this._generateObject('', english, target, undefined);
    this.end();
    console.log('Generated string: ', this._leafCount);
  }

  private _generateValue(path: string, english: any, target: any, metadata: any): void {
    if (typeof english === 'object')
      this._generateObject(path, english, target, metadata);
    else if (typeof english === 'string')
      this._generateLeaf(path, english, target, metadata);
  }

  private _generateObject(path: string, english: any, target: any, metadata: any): void {
    if (target !== undefined && typeof target !== 'object') throw new Error('Unexpected target value for ' + path + ': expected an object, found: ' + target);
    if (metadata !== undefined && typeof metadata !== 'object') throw new Error('Unexpected metadata value for ' + path + ': expected an object, found: ' + metadata);
    if (path === 'translations/from') {
      // specific case, the target language should not be present, instead all others must be present
      for (const lang of LANGUAGES) {
        if (lang.trailenceCode === this.targetLanguage.trailenceCode) continue;
        this._generateLeaf(path + '/' + lang.trailenceCode, lang.englishName, target?.[lang.trailenceCode], undefined);
      }
      return;
    }
    const subPathPrefix = path.length > 0 ? path + '/' : '';
    for (const key of Object.keys(english)) {
      const englishValue = english[key];
      const targetValue = target?.[key];
      const metadataValue = metadata?.[key];
      this._generateValue(subPathPrefix + key, englishValue, targetValue, metadataValue);
    }
  }

  private _generateLeaf(path: string, english: string, target: string | undefined, metadata: TranslationMetadata | undefined): void {
    if (target !== undefined && typeof target !== 'string') throw new Error('Unexpected target value for ' + path + ': ' + target);
    if (metadata !== undefined && typeof metadata !== 'object') throw new Error('Unexpected metadata for ' + path + ': ' + metadata);
    this._leafCount++;
    this.addTranslation(path, english, target, metadata);
  }

}
