export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE'
}

export enum ResponseType {
  JSON = 'json',
  TEXT = 'text',
  BLOB = 'blob'
}

export class TrailenceHttpRequest {

  constructor(
    public method: HttpMethod,
    public url: string,
    public headers: { [header: string]: string } = {},
    public body?: any,
    public responseType: ResponseType = ResponseType.JSON
  ) {}

  public static addQueryParam(url: string, name: string, value: string): string {
    if (url.indexOf('?') > 0) url += '&'; else url += '?';
    url += encodeURIComponent(name) + '=' + encodeURIComponent(value);
    return url;
  }

}
