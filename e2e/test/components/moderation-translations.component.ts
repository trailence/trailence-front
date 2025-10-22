import { Component } from './component';
import { IonicButton } from './ionic/ion-button';
import { IonicInput } from './ionic/ion-input';
import { IonicTextArea } from './ionic/ion-textarea';

export class ModerationTranslationsComponent extends Component {

  public async waitDisplayedAndOpen() {
    await this.waitDisplayed();
    await new IonicButton(this.getElement().$('div.page-section-title ion-button')).click();
    await this.getElement().$('div.source-lang select').waitForDisplayed();
  }

  public async setSourceLang(lang: string) {
    await this.getElement().$('div.source-lang select').selectByAttribute('value', lang);
    await this.getElement().$('ion-input[name=trailName]').waitForDisplayed();
  }

  public async setTrailName(name: string) {
    await new IonicInput(this.getElement().$('ion-input[name=trailName]')).setValue(name);
  }

  public async setTrailDescription(description: string) {
    await new IonicTextArea(this.getElement().$('ion-textarea[name=trailDescription]')).setValue(description);
  }

}
