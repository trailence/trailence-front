import { Console } from 'src/app/utils/console';
import { TrailenceHttpRequest } from './http-request';
import { TrailenceHttpResponse } from './http-response';

export class ApiError {

  constructor(
    public readonly httpCode: number,
    public readonly errorCode: string,
    public readonly errorMessage: string,
    public readonly request: string,
  ) {}

  public static fromHttpResponse(response: TrailenceHttpResponse<any>, request: TrailenceHttpRequest): ApiError {
    const req = request.method + ' ' + request.url;
    const error = response.body?.httpCode ? new ApiError(response.body.httpCode, response.body.errorCode, response.body.errorMessage, req) : new ApiError(response.status || 0, '', '', req);
    Console.warn('HTTP error', error);
    return error;
  }

}
