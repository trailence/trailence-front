import { Injectable } from '@angular/core';
import { HttpService } from '../http/http.service';
import { NetworkService } from '../network/network.service';
import { BehaviorSubject, EMPTY, map, Observable, of, switchMap, tap, timer } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { environment } from 'src/environments/environment';
import { Console } from 'src/app/utils/console';

const PAGE_SIZE = 50;
const REFRESH_SIZE = 5;

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
  private _lastNb = 0;
  private _email = '';

  constructor(
    private readonly http: HttpService,
    private readonly network: NetworkService,
    private readonly auth: AuthService,
  ) {
    auth.auth$.pipe(
      switchMap(auth => {
        if (!auth || auth.isAnonymous) {
          this._lastNb = 0;
          this._email = '';
          this.notifications$.next([]);
          return of(false);
        }
        if (this._email !== auth.email) {
          this._email = auth.email;
          this._lastNb = 0;
          this.notifications$.next([]);
        }
        return network.server$;
      }),
      switchMap(connected => connected ? timer(1000, 5 * 60000) : of(false)),
    ).subscribe(v => {
      if (v === false) return; // not connected
      if (v === 0) this.loadFirstNotifications();
      else this.refreshNotifications(1);
    });
  }

  private loadFirstNotifications(): void {
    const email = this._email;
    this.http.get<Notification[]>(environment.apiBaseUrl + '/notifications/v1?page=0&size=' + PAGE_SIZE).subscribe(list => {
      Console.info('Received ' + list.length + ' notifications from page 0');
      this._lastNb = list.length;
      this.notifications$.next(list.map(n => this.toDto(n, email)));
    });
  }

  private refreshNotifications(nb: number): void {
    const email = this._email;
    const size = Math.min(200, REFRESH_SIZE * nb);
    this.http.get<Notification[]>(environment.apiBaseUrl + '/notifications/v1?page=0&size=' + size).subscribe(list => {
      const newItems = list.filter(n => this.notifications$.value.findIndex(i => i.uuid === n.uuid) < 0);
      Console.info('Received ' + list.length + ' notifications from page 0 refresh ' + REFRESH_SIZE + ': ' + newItems.length + ' new items');
      if (newItems.length > 0) {
        this.notifications$.next([...newItems.map(n => this.toDto(n, email)), ...this.notifications$.value]);
        this.refreshNotifications(nb + 1);
      }
    });
  }

  public loadMore(): Observable<any> {
    const email = this._email;
    const page = Math.floor(this.notifications$.value.length / PAGE_SIZE);
    return this.http.get<Notification[]>(environment.apiBaseUrl + '/notifications/v1?page=' + page + '&size=' + PAGE_SIZE).pipe(
      tap(list => {
        Console.info('Received ' + list.length + ' notifications from page ' + page);
        this._lastNb = list.length;
        const newItems = list.filter(n => this.notifications$.value.findIndex(i => i.uuid === n.uuid) < 0);
        if (newItems.length > 0) {
          this.notifications$.next([...this.notifications$.value, ...newItems.map(n => this.toDto(n, email))].sort((n1, n2) => n2.date - n1.date));
        }
      }),
    );
  }

  private toDto(n: Notification, email: string): Notification {
    return {...n, email};
  }

  public get nbUnread$(): Observable<number> {
    return this.notifications$.pipe(map(list => list.reduce((p,v) => p + (v.read ? 0 : 1), 0)));
  }

  public get mayHaveMore() { return this._lastNb === PAGE_SIZE; }

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
