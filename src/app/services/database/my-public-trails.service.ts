import { Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { NetworkService } from '../network/network.service';
import { BehaviorSubject, concat, debounceTime, EMPTY, filter, switchMap, tap, timer } from 'rxjs';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { CommonDatabaseService } from './common-database.service';
import { Console } from 'src/app/utils/console';
import { MyPublicTrail } from 'src/app/model/dto/my-public-trail';

@Injectable({providedIn: 'root'})
export class MyPublicTrailsService {

  public readonly myPublicTrails$ = new BehaviorSubject<MyPublicTrail[]>([]);

  constructor(
    dbs: CommonDatabaseService,
    authService: AuthService,
    networkService: NetworkService,
    http: HttpService,
  ) {
    dbs.myPublicationsTable.onStatus$().pipe(
      switchMap(status => {
        if (this.myPublicTrails$.value.length > 0)
          this.myPublicTrails$.next([]);
        if (!status || authService.auth?.isAnonymous) {
          return EMPTY;
        }
        return concat(
          dbs.myPublicationsTable.getAll$(),
          networkService.server$.pipe(
            debounceTime(100),
            filter(connected => !!connected),
            debounceTimeExtended(1000, 60000),
            switchMap(() => timer(100, 30 * 60 * 1000)),
            switchMap(() => http.get<MyPublicTrail[]>(environment.apiBaseUrl + '/public/trails/v1/mine').pipe(
              tap(newList => dbs.myPublicationsTable.replaceAll$(() => newList).subscribe()),
            ))
          )
        );
      })
    ).subscribe({
      next: list => {
        if (list.length === 0 && this.myPublicTrails$.value.length === 0) return;
        this.myPublicTrails$.next(list);
      },
      error: e => {
        Console.error('Error getting my public trails', e);
      }
    });
  }

}
