import { Component } from './component';
import { IonicButton } from './ionic/ion-button';

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

  public async isPointSelected() {
    return await this.getElement().$('>>>ion-item.button-go-to-previous-point').isExisting();
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
    await this.getElement().$('>>>ion-item.button-go-to-next-point').click();
  }

  public async goToPreviousPoint() {
    await this.getElement().$('>>>ion-item.button-go-to-previous-point').click();
  }

  public async removePointsAfter() {
    await this.getElement().$('>>>ion-item.button-remove-points-after').click();
  }

  public async removePointsBefore() {
    await this.getElement().$('>>>ion-item.button-remove-points-before').click();
  }

  public async undo() {
    await this.getElement().$('app-icon-label-button[icon=undo]').click();
  }

}
