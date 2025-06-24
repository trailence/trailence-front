import { Injectable } from '@angular/core';
import { HttpService } from '../http/http.service';
import { NetworkService } from '../network/network.service';
import { BehaviorSubject, map, Observable, of, switchMap, timer } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { environment } from 'src/environments/environment';
import { Console } from 'src/app/utils/console';

export interface Notification {
  uuid: string;
  date: number;
  read: boolean;
  text: string;
  textElements: string[] | null | undefined;
}

@Injectable({providedIn: 'root'})
export class NotificationsService {

  public readonly notifications$ = new BehaviorSubject<Notification[]>([]);

  constructor(
    private readonly http: HttpService,
    readonly network: NetworkService,
    readonly auth: AuthService,
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
      this.notifications$.next(list.sort((n1, n2) => n2.date - n1.date));
    });
  }

  public get nbUnread$(): Observable<number> {
    return this.notifications$.pipe(map(list => list.reduce((p,v) => p + (v.read ? 0 : 1), 0)));
  }

  public get first5$(): Observable<Notification[]> {
    return this.notifications$.pipe(
      map(list => {
        const result = [...list];
        if (result.length > 5) result.splice(5, result.length - 5);
        return result;
      })
    );
  }

  public markAsRead(notification: Notification): void {
    notification.read = true;
    this.http.put<Notification>(environment.apiBaseUrl + '/notifications/v1/' + notification.uuid, notification).subscribe(
      result => {
        const i = this.notifications$.value.findIndex(n => n.uuid === result.uuid);
        if (i >= 0) {
          this.notifications$.value[i] = result;
          this.notifications$.next(this.notifications$.value);
        }
      }
    );
  }

}
