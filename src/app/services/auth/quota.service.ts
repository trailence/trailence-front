import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { BehaviorSubject, Observable } from 'rxjs';
import { UserQuotas } from './user-quotas';
import { Console } from 'src/app/utils/console';

@Injectable({providedIn: 'root'})
export class QuotaService {

  private readonly _quotas$ = new BehaviorSubject<UserQuotas | undefined>(undefined);

  constructor(
    private readonly auth: AuthService
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

}
