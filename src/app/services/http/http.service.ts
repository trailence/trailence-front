import { Injectable } from '@angular/core';
import { HttpClientService } from './http-client.service';
import { HttpMethod, TrailenceHttpRequest, ResponseType } from './http-request';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { TrailenceHttpResponse } from './http-response';
import { ApiError } from './api-error';

export type RequestInterceptor =
  ((request: TrailenceHttpRequest) => TrailenceHttpRequest) |
  ((request: TrailenceHttpRequest) => Observable<TrailenceHttpRequest>);

export type ResponseInterceptor =
  ((response: TrailenceHttpResponse<any>) => TrailenceHttpResponse<any>) |
  ((response: TrailenceHttpResponse<any>) => Observable<TrailenceHttpResponse<any>>);

@Injectable({
  providedIn: 'root'
})
export class HttpService {

  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];

  constructor(
    private httpClient: HttpClientService
  ) {}

  public addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  public addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  public get<T>(url: string): Observable<T> {
    return this.send(new TrailenceHttpRequest(HttpMethod.GET, url, {}, null, ResponseType.JSON));
  }

  public post<T>(url: string, body: any, headers?: any): Observable<T> {
    return this.send(new TrailenceHttpRequest(HttpMethod.POST, url, headers ?? {}, body, ResponseType.JSON));
  }

  public put<T>(url: string, body: any, headers?: any): Observable<T> {
    return this.send(new TrailenceHttpRequest(HttpMethod.PUT, url, headers ?? {}, body, ResponseType.JSON));
  }

  public delete(url: string): Observable<void> {
    return this.send(new TrailenceHttpRequest(HttpMethod.DELETE, url, {}, null, ResponseType.JSON));
  }

  public sendRaw(request: TrailenceHttpRequest): Observable<TrailenceHttpResponse<any>> {
    let interceptedRequest = of(request);
    for (const interceptor of this.requestInterceptors) {
      interceptedRequest = interceptedRequest.pipe(switchMap(previous => {
        const step = interceptor(previous);
        if (step instanceof TrailenceHttpRequest) return of(step);
        return step;
      }));
    }
    let interceptedResponse = interceptedRequest.pipe(switchMap(request => this.httpClient.send(request)));
    for (const interceptor of this.responseInterceptors) {
      interceptedResponse = interceptedResponse.pipe(switchMap(previous => {
        const step = interceptor(previous);
        if (step instanceof TrailenceHttpResponse) return of(step);
        return step;
      }));
    }
    return interceptedResponse;
  }

  public send<T>(request: TrailenceHttpRequest): Observable<T> {
    return this.sendRaw(request)
    .pipe(
      switchMap(response => {
        if (response.status / 100 === 2) return of(response.body);
        return throwError(() => ApiError.fromHttpResponse(response));
      })
    );
  }
}
