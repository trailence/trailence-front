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
      CapacitorHttp.request({
        method: request.method,
        url: request.url,
        headers: {...request.headers, 'User-Agent': window.navigator.userAgent},
        responseType: request.responseType,
        readTimeout: 30000,
        data: request.body,
      })
      .then(response => {
        // TODO
        subscriber.next(this.toResponse(request, response));
        subscriber.complete();
      })
      .catch(error => {
        // TODO
        subscriber.error(error);
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

}
