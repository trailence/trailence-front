import { Component } from './component';

export class TrailOverview extends Component {

  public async getTrailName() {
    const nameDiv = this.getElement().$('div.trail-name');
    return await nameDiv.getText();
  }

}
