import { TrailenceHttpResponse } from './http-response';

export class ApiError {

  constructor(
    public httpCode: number,
    public errorCode: string,
    public errorMessage: string,
  ) {}

  public static fromHttpResponse(r: TrailenceHttpResponse<any>): ApiError {
    if (r.body?.httpCode) return new ApiError(r.body.httpCode, r.body.errorCode, r.body.errorMessage);
    return new ApiError(r.status || 0, '', '');
  }

}
