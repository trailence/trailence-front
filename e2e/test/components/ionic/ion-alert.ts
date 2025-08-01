import { Component } from '../component';

export class IonicAlert extends Component {

  public get buttons() { return this.getElement().$$('.alert-button-group>button'); }
  public get input() { return this.getElement().$('.alert-input-wrapper input'); }
  public get textarea() {return this.getElement().$('.alert-input-wrapper textarea'); }

  public async clickButtonWithRole(role: string) {
    const button = this.getElement().$('.alert-button-group>button.alert-button-role-' + role);
    await button.waitForDisplayed();
    await button.click();
  }

  public async clickButtonWithText(text: string) {
    const button = this.getElement().$('.alert-button-group').$('span.alert-button-inner='+text);
    await button.waitForDisplayed();
    await button.click();
  }

  public async hasButtonWithText(text: string) {
    const button = this.getElement().$('.alert-button-group').$('span.alert-button-inner='+text);
    return await button.isExisting();
  }

  public async getInputValue() {
    await this.input.waitForDisplayed();
    return await this.input.getValue();
  }

  public async setInputValue(value: string) {
    await this.input.waitForDisplayed();
    await this.input.setValue(value);
  }

  public async setTextareaValue(value: string) {
    await this.textarea.waitForDisplayed();
    await this.textarea.setValue(value);
  }

  public async clickRadioButtonByLabel(label: string) {
    const l = this.getElement().$('div.alert-radio-label=' + label);
    await l.waitForDisplayed();
    await l.click();
  }

  public async getTitle() {
    return await this.getElement().$('h2.alert-title').getText();
  }

}
