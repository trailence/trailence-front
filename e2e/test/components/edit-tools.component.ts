import { Component } from './component';
import { IonicButton } from './ionic/ion-button';
import { IonicInput } from './ionic/ion-input';

export class EditTools extends Component {

  public async close() {
    await new IonicButton(this.getElement().$('ion-header ion-toolbar').$('>>>ion-button')).click();
  }

  public async backToOriginalTrack() {
    await new IonicButton(this.getElement().$('ion-item.button-back-to-original-track')).click();
  }

  public async canJoinArrivalToDeparture() {
    return await this.getElement().$('ion-item.button-join-arrival-to-departure').isExisting();
  }

  public async joinArrivalToDeparture() {
    await new IonicButton(this.getElement().$('ion-item.button-join-arrival-to-departure')).click();
  }

  public async canJoinDepartureToArrival() {
    return await this.getElement().$('ion-item.button-join-departure-to-arrival').isExisting();
  }

  public async joinDepartureToArrival() {
    await new IonicButton(this.getElement().$('ion-item.button-join-departure-to-arrival')).click();
  }

  public async isSelectionTool() {
    return await this.getElement().$('>>>app-edit-tools-selection').isExisting();
  }

  public async waitSelectionTool() {
    await browser.waitUntil(() => this.isSelectionTool());
    return new EditToolSelection(this.getElement().$('>>>app-edit-tools-selection'));
  }

  public async openRemoveBreaksMoves() {
    await new IonicButton(this.getElement().$('ion-item.button-remove-breaks-moves')).click();
    await this.getElement().$('>>>app-edit-tool-remove-breaks-moves').waitForDisplayed();
    return new RemoveBreaksMovesTool(this.getElement().$('>>>app-edit-tool-remove-breaks-moves'));
  }

  public async undo() {
    await this.getElement().$('app-icon-label-button[icon=undo]').click();
  }

}

export class EditToolSelection extends Component {

  public async extendSelection() {
    await this.getElement().$('>>>ion-item.extend-selection').click();
    await browser.waitUntil(() => this.getElement().$('>>>div.wait-for-extend-selection').isExisting());
  }

  public async createWayPoint() {
    await this.getElement().$('>>>ion-item.button-create-way-point').click();
  }

  public async removeWayPoint() {
    const button = this.getElement().$('>>>ion-item.button-remove-way-point');
    expect(await button.isExisting()).toBeTrue();
    await button.click();
  }

  public async goToNextPoint() {
    await new IonicButton(this.getElement().$('>>>div.point-carets').$('ion-button.go-to-next')).click();
  }

  public async goToPreviousPoint() {
    await new IonicButton(this.getElement().$('>>>div.point-carets').$('ion-button.go-to-previous')).click();
  }

  public async removePointsAfter() {
    await this.getElement().$('>>>ion-item.button-remove-points-after').click();
  }

  public async removePointsBefore() {
    await this.getElement().$('>>>ion-item.button-remove-points-before').click();
  }

  public async remove() {
    await this.getElement().$('>>>ion-item.button-remove-selection').click();
  }

  public async getElevation() {
    return await new IonicInput(this.getElement().$('>>>div.selection').$('ion-icon[name=altitude]').parentElement().$('ion-input')).getValue();
  }

  public async setElevation(value: number) {
    await new IonicInput(this.getElement().$('>>>div.selection').$('ion-icon[name=altitude]').parentElement().$('ion-input')).setValue('' + value);
  }

}

export class RemoveBreaksMovesTool extends Component {

  public async start() {
    await new IonicButton(this.getElement().$('>>>ion-button.button-start')).click();
  }

  public async expectMoves() {
    await browser.waitUntil(() => this.getElement().$('>>>ion-item.button-remove-moves').isExisting());
  }

  public async removeMoves() {
    await new IonicButton(this.getElement().$('>>>ion-item.button-remove-moves')).click();
  }

  public async continue() {
    await new IonicButton(this.getElement().$('>>>ion-button.button-continue')).click();
  }

  public async expectEnd() {
    await browser.waitUntil(() => this.getElement().$('div.no-more-breaks').isDisplayed());
  }

  public async quit() {
    await new IonicButton(this.getElement().$('>>>ion-footer').$('>>>ion-button')).click();
  }

}
