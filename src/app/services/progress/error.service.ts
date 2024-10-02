import { Injectable } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { I18nService } from '../i18n/i18n.service';
import { translate } from '../i18n/i18n-string';

@Injectable({providedIn: 'root'})
export class ErrorService {

  private _shownErrors: string[] = [];
  private _modal?: Promise<HTMLIonModalElement>;

  constructor(
    private modalController: ModalController,
    private i18n: I18nService,
  ) {}

  public addError(error: any): void {
    this.addErrors([error]);
  }

  public addErrors(errors: any[]): void {
    this.pushErrors(errors);
    if (this._modal || this._shownErrors.length === 0) return;
    this._modal = import('../../components/errors-modal/errors-modal.component')
    .then(module => this.modalController.create({
      initialBreakpoint: 0.25,
      breakpoints: [0, 0.25, 0.5, 0.75, 1],
      component: module.ErrorsModalComponent,
      componentProps: {
        errors: this._shownErrors
      },
      canDismiss: true,
      backdropDismiss: true,
      id: 'errors-modal',
    }).then(modal => {
      modal.present();
      modal.onWillDismiss().then(() => {
        this._modal = undefined;
        this._shownErrors = [];
      });
      return modal;
    }));
  }

  private pushErrors(errors: any[]): void {
    for (const error of errors) {
      const text = translate(error, this.i18n);
      this._shownErrors.push(text);
    }
  }

}
