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
    if (response.body?.httpCode) return new ApiError(response.body.httpCode, response.body.errorCode, response.body.errorMessage, req);
    return new ApiError(response.status || 0, '', '', req);
  }

}
