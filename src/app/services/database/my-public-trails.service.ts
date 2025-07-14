import { Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { NetworkService } from '../network/network.service';
import { BehaviorSubject, debounceTime, filter, Observable, of, switchMap, timer } from 'rxjs';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';

export interface MyPublicTrail {
  publicUuid: string;
  privateUuid: string;
}

@Injectable({providedIn: 'root'})
export class MyPublicTrailsService {

  public readonly myPublicTrails$ = new BehaviorSubject<MyPublicTrail[]>([]);

  constructor(
    authService: AuthService,
    networkService: NetworkService,
    http: HttpService,
  ) {
    authService.auth$.pipe(
      switchMap(auth => {
        if (!auth || auth.isAnonymous) return of([]);
        return networkService.server$.pipe(
          debounceTime(100),
          filter(connected => connected),
          debounceTimeExtended(1000, 60000),
          switchMap(() => timer(100, 30 * 60 * 1000)),
          switchMap(() => http.get<MyPublicTrail[]>(environment.apiBaseUrl + '/public/trails/v1/mine'))
        );
      })
    ).subscribe(list => this.myPublicTrails$.next(list));
  }

}
