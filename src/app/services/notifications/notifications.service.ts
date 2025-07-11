import { Injectable } from '@angular/core';
import { HttpService } from '../http/http.service';
import { NetworkService } from '../network/network.service';
import { BehaviorSubject, EMPTY, map, Observable, of, switchMap, timer } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { environment } from 'src/environments/environment';
import { Console } from 'src/app/utils/console';

export interface Notification {
  uuid: string;
  date: number;
  read: boolean;
  text: string;
  textElements: string[] | null | undefined;
  email: string;
}

@Injectable({providedIn: 'root'})
export class NotificationsService {

  public readonly notifications$ = new BehaviorSubject<Notification[]>([]);

  constructor(
    private readonly http: HttpService,
    private readonly network: NetworkService,
    private readonly auth: AuthService,
  ) {
    auth.auth$.pipe(
      switchMap(auth => {
        if (!auth || auth.isAnonymous) {
          this.notifications$.next([]);
          return of(false);
        }
        return network.server$;
      }),
      switchMap(connected => connected ? timer(1000, 5 * 60000) : of(false)),
    ).subscribe(v => {
      if (v === false) return; // not connected
      this.refreshNotifications();
    });
  }

  private refreshNotifications(): void {
    this.http.get<Notification[]>(environment.apiBaseUrl + '/notifications/v1').subscribe(list => {
      Console.info('Received ' + list.length + ' notifications');
      this.notifications$.next(list.sort((n1, n2) => n2.date - n1.date).map(n => ({...n, email: this.auth.email!})));
    });
  }

  public get nbUnread$(): Observable<number> {
    return this.notifications$.pipe(map(list => list.reduce((p,v) => p + (v.read ? 0 : 1), 0)));
  }

  public markAsRead(notification: Notification): void {
    notification.read = true;
    this.notifications$.next(this.notifications$.value);
    this.auth.auth$.pipe(
      switchMap(auth => {
        if (!auth || auth.isAnonymous || auth.email !== notification.email) return EMPTY;
        return this.network.server$;
      }),
      switchMap(connected => {
        if (!connected) return EMPTY;
        return this.http.put<Notification>(environment.apiBaseUrl + '/notifications/v1/' + notification.uuid, {...notification, email: undefined});
      }),
    ).subscribe(result => {
      const i = this.notifications$.value.findIndex(n => n.uuid === result.uuid);
      if (i >= 0) {
        this.notifications$.value[i] = result;
        this.notifications$.next(this.notifications$.value);
      }
    });
  }

}
