import { ChainablePromiseElement } from 'webdriverio';
import { App } from '../app/app';
import { Component } from './component';
import { IonicButton } from './ionic/ion-button';
import { IonicTextArea } from './ionic/ion-textarea';
import { ModalComponent } from './modal';

export class RateAndComments extends Component {

  public async rateAndComment(rating: number, comment: string) {
    const button = new IonicButton(this.getElement().$('div.rate-and-comment-button-container ion-button'));
    await button.click();
    const modal = new ModalComponent(await App.waitModal());
    const stars = modal.contentElement.$('>>>div.rating').$$('div.rate');
    await stars[rating].click();
    await new IonicTextArea(modal.contentElement.$('>>>ion-textarea')).setValue(comment);
    await (await modal.getFooterButtonWithColor('success')).click();
    await modal.waitNotDisplayed();
  }

  public get comments() { return this.getElement().$('div.comments').$$('app-feedback'); }

  public async getCommentText(feedback: ChainablePromiseElement) {
    return await feedback.$('div.feedback:not(.reply) div.comment').getText();
  }

  public async replyTo(feedback: ChainablePromiseElement, replyText: string) {
    await new IonicButton(feedback.$('div.feedback:not(.reply) div.footer ion-button[color=secondary]')).click();
    await new IonicTextArea(feedback.$('div.feedback.reply div.comment ion-textarea')).setValue(replyText);
    await new IonicButton(feedback.$('div.feedback.reply div.footer ion-button[color=success]')).click();
  }

}
