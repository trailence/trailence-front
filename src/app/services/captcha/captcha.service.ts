import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, filter, first, map, Observable } from 'rxjs';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { IdGenerator } from 'src/app/utils/component-utils';

@Injectable({providedIn: 'root'})
export class CaptchaService {

  private jsLoaded = new BehaviorSubject<boolean>(false);
  private jsLoading = false;
  private node?: HTMLScriptElement;
  private key = new BehaviorSubject<string>('');

  constructor(private http: HttpService) { }

  public displayOn(id: string, onsuccess: (token: string) => void, onexpired: () => void, onerror: (error: any) => void): void {
    const element = document.getElementById(id);
    if (!element) throw new Error('No element with id: ' + id);
    const elementId = IdGenerator.generateId();
    const container = document.createElement('DIV');
    container.id = elementId;
    element.appendChild(container);
    this.prepare();
    this.ready$().subscribe(() => {
      (window as any).grecaptcha.render(elementId, {
        'sitekey' : this.key.value,
        'callback': onsuccess,
        'expired-callback': onexpired,
        'error-callback': onerror
      });
    });
  }

  public unload(id: string): void {
    const element = document.getElementById(id);
    if (element) while (element.children.length > 0) element.removeChild(element.children.item(0)!);
  }

  private ready$(): Observable<boolean> {
    return combineLatest([this.jsLoaded, this.key]).pipe(
      filter(([js, key]) => !!js && key.length > 0),
      first(),
      map(() => true)
    );
  }

  public prepare(): void {
    this.ensureJS();
    this.ensureKey();
  }

  private ensureJS(): void {
    if (!this.jsLoading) {
      this.loadJS();
    }
  }

  private loadJS(): void {
    (window as any).grecaptcha_onloadCallback = () => {
      this.jsLoaded.next(true);
    };
    this.node = document.createElement('script');
    this.node.src = 'https://www.google.com/recaptcha/api.js?onload=grecaptcha_onloadCallback&render=explicit';
    this.node.type = 'text/javascript';
    this.node.async = true;
    this.node.defer = true;
    this.node.onerror = function(err: any) {
      console.log(err);
    };
    document.getElementsByTagName('head')[0].appendChild(this.node);
  }

  private ensureKey(): void {
    if (this.key.value.length > 0) return;
    this.loadKey();
  }

  private loadKey(): void {
    this.http.getString(environment.apiBaseUrl + '/auth/v1/captcha').subscribe(key => {console.log(key); this.key.next(key); });
  }

}
