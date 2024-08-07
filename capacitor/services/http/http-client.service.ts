import { Injectable } from '@angular/core';
import { CapacitorHttp, HttpResponse } from '@capacitor/core';
import { Observable } from 'rxjs';
import { IHttpClient } from 'src/app/services/http/http-client.interface';
import { TrailenceHttpRequest } from 'src/app/services/http/http-request';
import { TrailenceHttpResponse } from 'src/app/services/http/http-response';

@Injectable({
  providedIn: 'root'
})
export class HttpClientService implements IHttpClient {

  send(request: TrailenceHttpRequest): Observable<TrailenceHttpResponse<any>> {
    return new Observable(subscriber => {
      const headers = {...request.headers};
      headers['User-Agent'] = window.navigator.userAgent;
      if (request.body) headers['Content-Type'] = 'application/json';
      CapacitorHttp.request({
        method: request.method,
        url: request.url,
        headers: headers,
        responseType: request.responseType,
        readTimeout: 10000,
        connectTimeout: 10000,
        data: request.body,
      })
      .then(response => {
        subscriber.next(this.toResponse(request, response));
        subscriber.complete();
      })
      .catch(error => {
        subscriber.next(this.toErrorResponse(request, error));
        subscriber.complete();
      });
    });
  }

  private toResponse(request: TrailenceHttpRequest, response: HttpResponse): TrailenceHttpResponse<any> {
    return new TrailenceHttpResponse(
      request,
      this.body(response.data),
      response.headers,
      response.status,
      ''
    );
  }

  private body(data: any): any {
    if (data?.flag !== undefined) return data.flag;
    return data;
  }

  private toErrorResponse(request: TrailenceHttpRequest, error: any): TrailenceHttpResponse<any> {
    let status = 0;
    let code = '';
    let message = '';
    if (error['message']) message = error['message'];
    if (error['code']) code = error['code'];
    return new TrailenceHttpResponse(
      request,
      {
        httpCode: status,
        errorCode: code,
        errorMessage: message,
      },
      {},
      status,
      message
    )
  }

}
