export class TrailTranslations {

  public detectedLanguage?: string;
  public nameTranslations?: {[key: string]: string};
  public descriptionTranslations?: {[key: string]: string};

  public get valid(): boolean {
    if (!this.detectedLanguage || !this.nameTranslations || !this.descriptionTranslations) return false;
    for (const tl of translationsTargetLanguages) {
      if (!this.nameTranslations[tl.code] || this.nameTranslations[tl.code].trim().length === 0) return false;
      if (!this.descriptionTranslations[tl.code] || this.descriptionTranslations[tl.code].trim().length === 0) return false;
    }
    return true;
  }

}

export const translationsTargetLanguages = [
  { code: 'fr', name: 'Français' },
  { code: 'en', name: 'English' },
];
