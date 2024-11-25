import { Component } from './component';

export class CodeInput extends Component {

  public async setValue(code: string) {
    await browser.waitUntil(() => this.getElement().$$('input').length.then(nb => nb === code.length));
    const inputs = await this.getElement().$$('input').getElements();
    for (let i = 0; i < code.length; ++i) {
      await inputs.at(i)!.setValue(code.charAt(i));
    }
  }

}
