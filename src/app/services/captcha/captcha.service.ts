import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, filter, first, map, Observable } from 'rxjs';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { IdGenerator } from 'src/app/utils/component-utils';
import { Console } from 'src/app/utils/console';

@Injectable({providedIn: 'root'})
export class CaptchaService {

  private readonly jsLoaded = new BehaviorSubject<boolean>(false);
  private jsLoading = false;
  private node?: HTMLScriptElement;
  private readonly key = new BehaviorSubject<string | undefined>(undefined);

  constructor(private readonly http: HttpService) { }

  public displayOn(id: string, onsuccess: (token: string) => void, onexpired: () => void, onerror: (error: any) => void): void {
    const element = document.getElementById(id);
    if (!element) throw new Error('No element with id: ' + id);
    const elementId = IdGenerator.generateId();
    const container = document.createElement('DIV');
    container.id = elementId;
    element.appendChild(container);
    this.prepare();
    this.ready$().subscribe(() => {
      if (this.key.value?.length === 0) {
        onsuccess('disabled');
        return;
      }
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
      filter(([js, key]) => !!js && key !== undefined),
      first(),
      map(() => true)
    );
  }

  public prepare(): void {
    this.ensureKey();
    this.ensureJS();
  }

  private ensureJS(): void {
    if (!this.jsLoading) {
      this.jsLoading = true;
      this.loadJS();
    }
  }

  private loadJS(): void {
    this.key.pipe(
      filter(k => k !== undefined),
      first()
    ).subscribe(() => {
      if (this.key.value?.length === 0) {
        this.jsLoaded.next(true);
        return;
      }
      (window as any).grecaptcha_onloadCallback = () => {
        this.jsLoaded.next(true);
      };
      this.node = document.createElement('script');
      this.node.src = 'https://www.google.com/recaptcha/api.js?onload=grecaptcha_onloadCallback&render=explicit';
      this.node.type = 'text/javascript';
      this.node.async = true;
      this.node.defer = true;
      this.node.onerror = function(err: any) {
        Console.error('Error loading captcha', err);
      };
      document.getElementsByTagName('head')[0].appendChild(this.node);
    });
  }

  private ensureKey(): void {
    if (this.key.value !== undefined) return;
    this.loadKey();
  }

  private loadKey(): void {
    this.http.getString(environment.apiBaseUrl + '/auth/v1/captcha').subscribe(key => {Console.info('Captcha key: <' + key + '>'); this.key.next(key); });
  }

}
