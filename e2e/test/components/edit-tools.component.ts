import { App } from '../app/app';
import { Component } from './component';
import { EditToolElevationThresholdModal } from './edit-tool-elevation-threshold.modal';
import { IonicButton } from './ionic/ion-button';
import { IonicInput } from './ionic/ion-input';
import { ModalComponent } from './modal';
import { ToolbarComponent } from './toolbar.component';
import { Key } from 'webdriverio';

export class EditTools extends Component {

  public get toolbar() { return new ToolbarComponent(this.getElement().$('app-toolbar')); }

  public async close() {
    await this.toolbar.clickByIcon('cross');
  }

  public async backToOriginalTrack() {
    const menu = await this.toolbar.clickByIconAndGetMenu('distance');
    await menu.clickItemWithText('Back to original track without improvements');
  }

  public async removeUnprobableElevations() {
    const menu = await this.toolbar.clickByIconAndGetMenu('elevation');
    await menu.clickItemWithText('Adjust implausible elevations');
  }

  public async canJoinArrivalToDeparture() {
    const menu = await this.toolbar.clickByIconAndGetMenu('path');
    const present = await menu.getItemWithText('Finish at the departure point').isExisting();
    await menu.close();
    return present;
  }

  public async joinArrivalToDeparture() {
    const menu = await this.toolbar.clickByIconAndGetMenu('path');
    await menu.clickItemWithText('Finish at the departure point');
  }

  public async canJoinDepartureToArrival() {
    const menu = await this.toolbar.clickByIconAndGetMenu('path');
    const present = await menu.getItemWithText('Start at the arrival point').isExisting();
    await menu.close();
    return present;
  }

  public async joinDepartureToArrival() {
    const menu = await this.toolbar.clickByIconAndGetMenu('path');
    await menu.clickItemWithText('Start at the arrival point');
  }

  public async isSelectionTool() {
    return await $('div.edit-tool.selection-tool').isExisting();
  }

  public async waitSelectionTool(timeout?: number) {
    await browser.waitUntil(() => this.isSelectionTool(), {timeout});
    return new EditToolSelection($('div.edit-tool.selection-tool'));
  }

  public async openElevationThreshold() {
    const menu = await this.toolbar.clickByIconAndGetMenu('elevation');
    await menu.clickItemWithText('Smooth with an elevation threshold');
    return new EditToolElevationThresholdModal(await App.waitModal());
  }

  public async canUndo() {
    return (await this.toolbar.getButtonByIcon('undo').parentElement().getAttribute('class')).indexOf('disabled') < 0;
  }

  public async undo() {
    await this.toolbar.clickByIcon('undo');
  }

  public async createWayPoint() {
    const menu = await this.toolbar.clickByIconAndGetMenu('location');
    await menu.clickItemWithText('Create a waypoint');
    const modal = await App.waitModal();
    (await new ModalComponent(modal).getFooterButtonWithColor('success')).click();
  }

  public async removeWayPoint() {
    const menu = await this.toolbar.clickByIconAndGetMenu('location');
    await menu.clickItemWithText('Remove the waypoint');
  }

  public async removePointsAfter() {
    const menu = await this.toolbar.clickByIconAndGetMenu('selection');
    await menu.clickItemWithText('Remove all points after this one');
  }

  public async removePointsBefore() {
    const menu = await this.toolbar.clickByIconAndGetMenu('selection');
    await menu.clickItemWithText('Remove all points before this one');
  }

  public async removeSelectedPointAndReconnect() {
    const menu = await this.toolbar.clickByIconAndGetMenu('selection');
    await menu.clickItemWithText('Delete the selected point and reconnect the track');
  }

  public async removeSelectedRangeAndReconnect() {
    const menu = await this.toolbar.clickByIconAndGetMenu('selection');
    await menu.clickItemWithText('Delete the selected section and reconnect the track');
  }

}

export class EditToolSelection extends Component {

  private _expanded?: boolean = undefined;

  public get expandButton() { return new IonicButton(this.getElement().$('>>>div.edit-tool-expand-button ion-button')); }

  public async isExpanded() {
    if (this._expanded !== undefined) return this._expanded;
    const iconName = await this.expandButton.getElement().$('>>>ion-icon').getAttribute('name')
    this._expanded = iconName === 'chevron-down';
    return this._expanded!;
  }

  public async toggleExpand() {
    await this.expandButton.click();
    if (this._expanded !== undefined) this._expanded = !this._expanded;
  }

  public async ensureExpanded() {
    if (!(await this.isExpanded())) await this.toggleExpand();
  }

  public async extendSelection() {
    await this.getElement().$('>>>ion-item.extend-selection').click();
    await browser.waitUntil(() => this.getElement().$('>>>div.message').isExisting());
  }

  public async goToNextPoint() {
    await new IonicButton(this.getElement().$('>>>div.point-carets').$('ion-button.go-to-next')).click();
  }

  public async goToPreviousPoint() {
    await new IonicButton(this.getElement().$('>>>div.point-carets').$('ion-button.go-to-previous')).click();
  }

  public get elevationInput() { return new IonicInput(this.getElement().$('>>>div.selection-points').$('ion-icon[name=altitude]').parentElement().$('ion-input')); }

  public async getElevation() {
    await this.ensureExpanded();
    return await this.elevationInput.getValue();
  }

  public async setElevation(value: number) {
    await this.ensureExpanded();
    await this.elevationInput.getElement().click();
    await this.elevationInput.setValue('' + value);
  }

}
