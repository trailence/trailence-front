import { Observable } from 'rxjs';
import { TrailenceHttpRequest } from './http-request';
import { TrailenceHttpResponse } from './http-response';

export interface IHttpClient {

  send(request: TrailenceHttpRequest): Observable<TrailenceHttpResponse<any>>;

}
