import { Injectable } from '@angular/core';
import { CapacitorHttp, HttpHeaders, HttpResponse } from '@capacitor/core';
import { Observable } from 'rxjs';
import { IHttpClient } from 'src/app/services/http/http-client.interface';
import { TrailenceHttpRequest, ResponseType } from 'src/app/services/http/http-request';
import { TrailenceHttpResponse } from 'src/app/services/http/http-response';
import { BinaryContent } from 'src/app/utils/binary-content';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class HttpClientService implements IHttpClient {

  send(request: TrailenceHttpRequest): Observable<TrailenceHttpResponse<any>> {
    return new Observable(subscriber => {
      const headers = {...request.headers};
      headers['User-Agent'] = window.navigator.userAgent;
      headers['Referer'] = environment.baseUrl + '/';
      let dataAndType: Promise<{data: any, dataType: 'file' | 'formData' | undefined}>;
      if (request.body instanceof Blob) {
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/octet-stream';
        dataAndType = new Promise(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => {
            let url = reader.result as string;
            if (url.startsWith('data:')) {
              const i = url.indexOf(';base64,');
              url = url.substring(i + 8);
            }
            resolve({data: url, dataType: 'file'});
          };
          reader.readAsDataURL(request.body);
        });
      } else {
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        dataAndType = Promise.resolve({data: request.body, dataType: undefined});
      }
      dataAndType.then(d =>
        CapacitorHttp.request({
          method: request.method,
          url: request.url,
          headers: headers,
          responseType: request.responseType,
          readTimeout: 10000,
          connectTimeout: 10000,
          data: d.data,
          dataType: d.dataType,
        })
      )
      .then(response => {
        this.toResponse(request, response).then(response => {
          subscriber.next(response);
          subscriber.complete();
        });
      })
      .catch(error => {
        subscriber.next(this.toErrorResponse(request, error));
        subscriber.complete();
      });
    });
  }

  private toResponse(request: TrailenceHttpRequest, response: HttpResponse): Promise<TrailenceHttpResponse<any>> {
    if ((response as any)['error']) {
      return Promise.resolve(new TrailenceHttpResponse(
        request,
        undefined,
        {},
        response.status,
        response.data
      ));
    }
    return this.body(response.data, request.responseType, response.headers).then(body => {
      return new TrailenceHttpResponse(
        request,
        body,
        response.headers,
        response.status,
        ''
      );
    });
  }

  private body(data: any, responseType: ResponseType, responseHeaders: HttpHeaders): Promise<any> {
    if (data?.flag !== undefined) return Promise.resolve(data.flag);
    if (responseType === ResponseType.BLOB) {
      let type = '';
      for (const key in responseHeaders) {
        if (key.toLowerCase() === 'content-type') {
          type = responseHeaders[key];
          break;
        }
      }
      return new BinaryContent(data, type).toBlob();
    }
    return Promise.resolve(data);
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
    );
  }

}
