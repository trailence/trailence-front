import { Injectable } from '@angular/core';
import { HttpService } from '../http/http.service';
import { Observable } from 'rxjs';
import { I18nService } from '../i18n/i18n.service';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class GeoService {

  constructor(
    private http: HttpService,
    private i18n: I18nService,
  ) {}

  public findNearestPlaces(latitude: number, longitude: number): Observable<string[][]> {
    return this.http.get<string[][]>(environment.apiBaseUrl + '/place/v1?lat=' + latitude + '&lng=' + longitude + '&lang=' + this.i18n.textsLanguage);
  }

}
