import { PageWithHeader } from '../app/pages/page'
import { IonicButton } from './ionic/ion-button';
import {ChainablePromiseElement } from 'webdriverio';

export class CommentsModeration extends PageWithHeader {

  constructor() {
    super('comments-moderation')
  }

  protected expectedUrl(url: string): boolean {
    return url.endsWith('/moderation/comments');
  }

  public async refresh() {
    await new IonicButton(this.getElement().$('div.refresh ion-button')).click();
  }

  public get trails() { return this.getElement().$$('div.trail'); }

  public async getTrailName(trail: ChainablePromiseElement) {
    return await trail.$('div.trail-link a').getText();
  }

  public getTrailComments(trail: ChainablePromiseElement) {
    return trail.$('div.feedbacks').$$('app-feedback');
  }

}
