import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { TrailenceHttpRequest } from './http-request';
import { Observable, catchError, map, of } from 'rxjs';
import { TrailenceHttpResponse } from './http-response';
import { IHttpClient } from './http-client.interface';

@Injectable({
  providedIn: 'root'
})
export class HttpClientService implements IHttpClient {

  constructor(private readonly client: HttpClient) {}

  public send(request: TrailenceHttpRequest): Observable<TrailenceHttpResponse<any>> {
    return this.client.request(
      request.method,
      request.url,
      {
        headers: request.headers,
        observe: 'response',
        responseType: request.responseType,
        body: request.body
      }
    ).pipe(
      map(r => this.toResponse(request, r)),
      catchError(err => of(this.toResponse(request, err)))
    );
  }

  private toResponse<T>(request: TrailenceHttpRequest, response: HttpResponse<T>): TrailenceHttpResponse<T> {
    if (response instanceof HttpErrorResponse)
      return new TrailenceHttpResponse<T>(request, response.error, this.toHeaders(response.headers), response.status, response.statusText);
    return new TrailenceHttpResponse<T>(request, response.body, this.toHeaders(response.headers), response.status, response.statusText);
  }

  private toHeaders(headers: HttpHeaders): { [header: string]: string } {
    const result: { [header: string]: string } = {};
    if (headers)
      for (const key of headers.keys()) {
        result[key] = headers.get(key)!;
      }
    return result;
  }
}
