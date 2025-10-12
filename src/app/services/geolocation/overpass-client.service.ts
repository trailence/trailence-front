import { Injectable } from '@angular/core';
import { HttpService } from '../http/http.service';
import { catchError, Observable, of, switchMap, throwError } from 'rxjs';
import { ApiError } from '../http/api-error';
import { Console } from 'src/app/utils/console';

@Injectable({
  providedIn: 'root'
})
export class OverpassClient {

  constructor(
    private readonly http: HttpService,
  ) {}

  public request<T>(body: string): Observable<T> {
    return this.http.post<T>('https://overpass-api.de/api/interpreter', body).pipe(
      catchError(err => {
        if (err instanceof ApiError && (err.httpCode === 504 || err.httpCode === 429)) {
          Console.warn('Overpass timeout', err);
          return this.http.post<T>('https://overpass.private.coffee/api/interpreter', body).pipe(
            switchMap(response => {
              if (response && (response as any)['error']) {
                return throwError(() => (response as any)['error']);
              }
              return of(response);
            })
          );
        }
        return throwError(() => err);
      })
    );
  }

}
