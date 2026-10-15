import { Params } from '@angular/router';

export class UrlUtils {

  public static parseQueryParams(url: string): Params {
    const q = url.indexOf('?');
    if (q < 0) return {};
    const query = url.substring(q + 1);
    const queryParams: Params = {};
    const search = /([^&=]+)=?([^&]*)/g;
    const decode = (s: string) => decodeURIComponent(s.replaceAll('+', ' '));
    let match;
    while (match = search.exec(query))
      queryParams[decode(match[1])] = decode(match[2]);
    return queryParams;
  }

}
