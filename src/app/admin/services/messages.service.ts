import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { HttpService } from 'src/app/services/http/http.service';
import { Console } from 'src/app/utils/console';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { environment } from 'src/environments/environment';
import { PageRequest } from '../components/paginator/page-request';
import { PageResult } from '../components/paginator/page-result';
import { ContactMessageDto } from '../model/contact-message';

@Injectable({providedIn: 'root'})
export class MessagesService {

  private readonly _unreadCount$ = new BehaviorSubject<number | undefined>(undefined);

  constructor(
    private readonly http: HttpService,
  ) {}

  public get unreadCount$(): Observable<number> {
    if (!this._unreadCount$.observed && this._unreadCount$.value === undefined) this.refreshUnreadCount();
    return this._unreadCount$.pipe(filterDefined());
  }

  public refreshUnreadCount(): void {
    this.http.get<number>(environment.apiBaseUrl + '/contact/v1/unread').subscribe({
      next: nb => this._unreadCount$.next(nb),
      error: e => {
        Console.error(e);
        // TODO
      }
    })
  }

  public getMessages(request: PageRequest): Observable<PageResult<ContactMessageDto>> {
    return this.http.get<PageResult<ContactMessageDto>>(environment.apiBaseUrl + '/contact/v1' + request.toQueryParams());
  }

  public deleteMessages(messages: ContactMessageDto[]): Observable<any> {
    return this.http.post(environment.apiBaseUrl + '/contact/v1/delete', messages.map(m => m.uuid)).pipe(
      tap(() => this.refreshUnreadCount()),
    );
  }

  public markAsRead(messages: ContactMessageDto[], read: boolean): Observable<any> {
    return this.http.put(environment.apiBaseUrl + '/contact/v1/' + (read ? 'read' : 'unread'), messages.map(m => m.uuid)).pipe(
      tap(() => this.refreshUnreadCount()),
    );
  }

}