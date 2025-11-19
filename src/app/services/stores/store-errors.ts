import { Injector } from '@angular/core';
import { ApiError } from '../http/api-error';
import { ToastController } from '@ionic/angular/standalone';
import { I18nService } from '../i18n/i18n.service';

interface ItemError {
  item: string;
  nbAttempts: number;
  lastAttempt: number;
  lastErrorIsQuota: boolean;
}

export class StoreErrors {
  private _errors: ItemError[] = [];
  private _quotaReachedToastDone = false;

  constructor(
    private readonly injector: Injector,
    private readonly tableName: string,
    private readonly isQuotaReached: () => boolean
  ) {}

  public itemError(item: string, error: any): void {
    const err = this._errors.find(e => e.item === item);
    if (err) {
      err.nbAttempts++;
      err.lastAttempt = Date.now();
      err.lastErrorIsQuota = this.isQuotaError(error);
    } else {
      this._errors.push({item, nbAttempts: 1, lastAttempt: Date.now(), lastErrorIsQuota: this.isQuotaError(error)});
    }
  }

  public itemsError(items: string[], error: any): void {
    for (const item of items) this.itemError(item, error);
  }

  public itemSuccess(item: string): void {
    const i = this._errors.findIndex(e => e.item === item);
    if (i >= 0) this._errors.splice(i, 1);
  }

  public itemsSuccess(items: string[]): void {
    for (const item of items) this.itemSuccess(item);
  }

  public canProcess(item: string, isCreation: boolean): boolean { // NOSONAR
    const err = this._errors.find(e => e.item === item);
    if (!isCreation && !err) return true;
    const quotaReached = this.isQuotaReached();
    if (isCreation) {
      if (quotaReached) {
        if (!this._quotaReachedToastDone) {
          this._quotaReachedToastDone = true;
          this.injector.get(ToastController).create({
            message: this.injector.get(I18nService).texts.quota_error[this.tableName],
            duration: 5000,
            position: 'bottom',
            color: 'danger'
          }).then(t => t.present());
        }
        return false;
      } else {
        this._quotaReachedToastDone = false;
      }
    }
    if (!err) return true;
    const minDelay =
      err.lastErrorIsQuota && quotaReached ? 60 * 60000 :
      err.nbAttempts < 3 ? 5000 :
      err.nbAttempts < 10 ? 30000 :
      err.nbAttempts < 20 ? 5 * 60000 :
      60 * 60000;
    return Date.now() - err.lastAttempt > minDelay;
  }

  public reset(): void {
    this._errors = [];
  }

  private isQuotaError(error: any): boolean {
    return error instanceof ApiError && error.httpCode === 403 && error.errorCode?.startsWith("quota-exceeded-");
  }

}
