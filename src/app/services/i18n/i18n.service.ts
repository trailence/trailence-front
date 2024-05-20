import { Injectable } from '@angular/core';
import { PreferencesService } from '../preferences/preferences.service';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

const TEXTS_VERSION = '1';

@Injectable({
  providedIn: 'root'
})
export class I18nService {

  private _texts: any;
  private _textsLoading?: string;
  private _textsLoaded$ = new BehaviorSubject<string | undefined>(undefined);

  constructor(
    prefService: PreferencesService,
  ) {
    prefService.preferences$.subscribe(p => this.loadTexts(p.lang!))
  }

  public get texts(): any { return this._texts; }
  public get textsLanguage$(): Observable<string | undefined> { return this._textsLoaded$; }

  private loadTexts(lang: string): void {
    if (this._textsLoading === lang) return;
    this._textsLoading = lang;
    if (this._textsLoaded$.value === lang) return;
    const iframe = document.createElement('IFRAME') as HTMLIFrameElement;
    iframe.style.position = 'fixed';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.onload = () => {
      if (this._textsLoading !== lang) return;
      const text = iframe.contentDocument?.documentElement.innerText;
      if (text) {
        const data = JSON.parse(text);
        this._texts = data;
        console.log('i18n texts loaded for language ', lang);
        document.documentElement.lang = lang;
        this._textsLoaded$.next(lang);
      } else {
        console.log('Unable to load i18n texts for language ', lang);
        // TODO
      }
      iframe.parentElement?.removeChild(iframe);
    };
    iframe.onerror = e => {
      console.error('error loading i18n texts for language ', lang, e);
    };
    iframe.src = environment.assetsUrl + '/i18n/' + lang + '.' + TEXTS_VERSION + '.json';
    document.documentElement.appendChild(iframe);
  }

}
