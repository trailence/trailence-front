import { Injectable } from '@angular/core';
import { HttpService } from '../http/http.service';
import { catchError, map, Observable, of, switchMap, throwError, timeout } from 'rxjs';
import { ApiError } from '../http/api-error';

@Injectable({
  providedIn: 'root'
})
export class OverpassClient {

  constructor(
    private readonly http: HttpService,
  ) {}

  private readonly instances: OverpassInstance[] = [
    {
      url: 'https://overpass-api.de/api/interpreter',
      maxTimeoutSeconds: 10,
      isTimeout: (response, err) => !response && err instanceof ApiError && (err.httpCode === 504 || err.httpCode === 429)
    }, {
      url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      maxTimeoutSeconds: 60,
      isTimeout: (response, err) => !!response?.remark?.includes('timed out'),
    }, {
      url: 'https://overpass.private.coffee/api/interpreter',
      maxTimeoutSeconds: 60,
      isTimeout: (response, err) => !!response?.error,
    }
  ];

  public request<T>(body: string, timeoutSeconds: number): Observable<T> {
    return this.doRequestOnInstance<T>(body, timeoutSeconds, 0);
  }

  private doRequestOnInstance<T>(body: string, timeoutSeconds: number, instanceIndex: number): Observable<T> {
    const instance = this.instances[instanceIndex];
    const to = Math.min(timeoutSeconds, instance.maxTimeoutSeconds);
    return this.http.post<T>(instance.url, '[out:json][timeout:' + to + '];' + body).pipe(
      catchError(error => of(new OverpassInstanceResponse<T>(undefined, error))),
      map(response => {
        if (response instanceof OverpassInstanceResponse) return response;
        return new OverpassInstanceResponse<T>(response, undefined);
      }),
      timeout({
        each: to * 1000,
        with: () => of(new OverpassInstanceResponse<T>(undefined, new Error('Timeout requesting on ' + instance.url))),
      }),
      switchMap(response => {
        if (instanceIndex === this.instances.length - 1 || !this.isTimemout(response, instance)) {
          if (response.error) return throwError(() => response.error) as Observable<T>;
          return of(response.response!); // NOSONAR
        };
        return this.doRequestOnInstance<T>(body, timeoutSeconds, instanceIndex + 1);
      })
    );
  }

  private isTimemout(response: OverpassInstanceResponse<any>, instance: OverpassInstance): boolean {
    if (response.error instanceof Error && response.error.message.startsWith('Timeout')) return true;
    return instance.isTimeout(response.response, response.error);
  }

}

interface OverpassInstance {
  url: string;
  maxTimeoutSeconds: number;
  isTimeout: (response: any, err: any) => boolean;
}

class OverpassInstanceResponse<T> {
  constructor(
    public readonly response: T | undefined,
    public readonly error: any,
  ) {}
}
