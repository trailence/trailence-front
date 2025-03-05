import { Injectable, Injector } from '@angular/core';
import { AuthService } from './auth.service';
import { BehaviorSubject, Observable } from 'rxjs';
import { UserQuotas } from './user-quotas';
import { Console } from 'src/app/utils/console';
import { ToastController } from '@ionic/angular/standalone';
import { I18nService } from '../i18n/i18n.service';

@Injectable({providedIn: 'root'})
export class QuotaService {

  private readonly _quotas$ = new BehaviorSubject<UserQuotas | undefined>(undefined);

  constructor(
    private readonly auth: AuthService,
    private readonly injector: Injector,
  ) {
    auth.auth$.subscribe(a => this._quotas$.next(a?.quotas));
    this._quotas$.subscribe(q => Console.info('New quotas', q));
  }

  public get quotas(): UserQuotas | undefined { return this._quotas$.value; }
  public get quotas$(): Observable<UserQuotas | undefined> { return this._quotas$; }

  public updateQuotas(updater: (quotas: UserQuotas) => void): void {
    const quotas = this.quotas;
    if (!quotas) return;
    updater(quotas);
    this.auth.quotasUpdated(quotas);
    this._quotas$.next(quotas);
  }

  public checkQuota(isReached: (quota: UserQuotas) => boolean, error: string): boolean {
    const q = this.quotas;
    if (!q) return true;
    if (!isReached(q)) return true;
    this.injector.get(ToastController).create({
      message: this.injector.get(I18nService).texts.quota_reached[error],
      duration: 5000,
      position: 'bottom',
      color: 'danger'
    }).then(t => t.present());
    return false;
  }

}
