import { Injectable } from '@angular/core';
import { HttpClientService } from './http-client.service';
import { HttpMethod, TrailenceHttpRequest, ResponseType } from './http-request';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { TrailenceHttpResponse } from './http-response';
import { ApiError } from './api-error';

export type RequestInterceptor = (request: TrailenceHttpRequest) => TrailenceHttpRequest | Observable<TrailenceHttpRequest>;

export type ResponseInterceptor = (response: TrailenceHttpResponse<any>) => TrailenceHttpResponse<any> | Observable<TrailenceHttpResponse<any>>;

@Injectable({
  providedIn: 'root'
})
export class HttpService {

  private readonly requestInterceptors: RequestInterceptor[] = [];
  private readonly responseInterceptors: ResponseInterceptor[] = [];

  constructor(
    private readonly httpClient: HttpClientService
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

  public getString(url: string): Observable<string> {
    return this.send(new TrailenceHttpRequest(HttpMethod.GET, url, {}, null, ResponseType.TEXT));
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

  public getBlob(url: string): Observable<Blob> {
    return this.send(new TrailenceHttpRequest(HttpMethod.GET, url, {}, null, ResponseType.BLOB));
  }

  public sendRaw(request: TrailenceHttpRequest): Observable<TrailenceHttpResponse<any>> {
    return this.interceptRequest(request, [...this.requestInterceptors], 0);
  }

  private interceptRequest(request: TrailenceHttpRequest, interceptors: RequestInterceptor[], interceptorIndex: number): Observable<TrailenceHttpResponse<any>> {
    let r = request;
    do {
      if (interceptorIndex >= interceptors.length) {
        if (this.responseInterceptors.length === 0) return this.httpClient.send(r);
        return this.httpClient.send(r).pipe(switchMap(resp => this.interceptResponse(resp, [...this.responseInterceptors], 0)));
      }
      let nr = interceptors[interceptorIndex++](r);
      if (!(nr instanceof TrailenceHttpRequest)) {
        return nr.pipe(switchMap(req => this.interceptRequest(req, interceptors, interceptorIndex))); // NOSONAR
      }
      r = nr;
    } while (true);
  }

  private interceptResponse(response: TrailenceHttpResponse<any>, interceptors: ResponseInterceptor[], interceptorIndex: number): Observable<TrailenceHttpResponse<any>> {
    let r = response;
    do {
      if (interceptorIndex >= interceptors.length) return of(r);
      let nr = interceptors[interceptorIndex++](r);
      if (!(nr instanceof TrailenceHttpResponse)) {
        return nr.pipe(switchMap(resp => this.interceptResponse(resp, interceptors, interceptorIndex))); // NOSONAR
      }
      r = nr;
    } while (true);
  }

  public send<T>(request: TrailenceHttpRequest): Observable<T> {
    return this.sendRaw(request)
    .pipe(
      switchMap(response => {
        if (response.status / 100 === 2) return of(response.body);
        return throwError(() => ApiError.fromHttpResponse(response, request));
      })
    );
  }
}
