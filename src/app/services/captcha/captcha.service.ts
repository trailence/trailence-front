import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, filter, first, map, Observable, of } from 'rxjs';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { IdGenerator } from 'src/app/utils/component-utils';
import { Console } from 'src/app/utils/console';

interface ConfigFromServer {
  provider: string;
  clientKey: string;
}

interface CaptchaConfig {
  enabled: boolean;
  scriptUrl: string;
  render: (elementId: string, onsuccess: (token: string) => void, onexpired: () => void, onerror: (error: any) => void) => void;
}

@Injectable({providedIn: 'root'})
export class CaptchaService {

  private readonly jsLoaded = new BehaviorSubject<boolean>(false);
  private jsLoading = false;
  private node?: HTMLScriptElement;
  private readonly config = new BehaviorSubject<CaptchaConfig | undefined>(undefined);

  constructor(private readonly http: HttpService) { }

  public displayOn(id: string, onsuccess: (token: string) => void, onexpired: () => void, onerror: (error: any) => void): void {
    const element = document.getElementById(id);
    if (!element) throw new Error('No element with id: ' + id);
    const elementId = IdGenerator.generateId();
    const container = document.createElement('DIV');
    container.id = elementId;
    element.appendChild(container);
    this.prepare();
    this.ready$().subscribe(config => {
      config.render(elementId, onsuccess, onexpired, onerror);
    });
  }

  public unload(id: string): void {
    const element = document.getElementById(id);
    if (element) while (element.children.length > 0) element.removeChild(element.children.item(0)!);
  }

  private ready$(): Observable<CaptchaConfig> {
    return combineLatest([this.jsLoaded, this.config]).pipe(
      filter(([js, config]) => !!js && config !== undefined),
      first(),
      map(([js, config]) => config!)
    );
  }

  public prepare(): void {
    this.ensureConfig().subscribe(() => this.ensureJS());
  }

  private ensureJS(): void {
    if (!this.jsLoading) {
      this.jsLoading = true;
      this.loadJS();
    }
  }

  private loadJS(): void {
    this.config.pipe(
      filter(k => k !== undefined),
      first()
    ).subscribe(c => {
      if (!c.enabled) {
        this.jsLoaded.next(true);
        return;
      }
      (window as any).captcha_onloadCallback = () => {
        this.jsLoaded.next(true);
      };
      this.node = document.createElement('script');
      this.node.src = c.scriptUrl;
      this.node.type = 'text/javascript';
      this.node.async = true;
      this.node.defer = true;
      this.node.onerror = function(err: any) {
        Console.error('Error loading captcha', err);
      };
      document.getElementsByTagName('head')[0].appendChild(this.node);
    });
  }

  private ensureConfig(): Observable<CaptchaConfig> {
    if (this.config.value !== undefined) return of(this.config.value);
    return this.loadConfig();
  }

  private loadConfig(): Observable<CaptchaConfig> {
    return this.http.get<ConfigFromServer>(environment.apiBaseUrl + '/auth/v1/captcha')
    .pipe(
      map(config => {
        Console.info('Captcha config', config);
        let c: CaptchaConfig;
        if (config.provider === 'recaptcha' && config.clientKey.length > 0) {
          c = {
            enabled: true,
            scriptUrl: 'https://www.google.com/recaptcha/api.js?onload=captcha_onloadCallback&render=explicit',
            render: (elementId, onsuccess, onexpired, onerror) => {
              (window as any).grecaptcha.render(elementId, {
                'sitekey' : config.clientKey,
                'callback': onsuccess,
                'expired-callback': onexpired,
                'error-callback': onerror
              });
            }
          };
        } else if (config.provider === 'turnstile' && config.clientKey.length > 0) {
          c = {
            enabled: true,
            scriptUrl: 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=captcha_onloadCallback',
            render: (elementId, onsuccess, onexpired, onerror) => {
              (window as any).turnstile.render('#' + elementId, {
                'sitekey' : config.clientKey,
                'callback': onsuccess,
                'expired-callback': onexpired,
                'error-callback': onerror
              });
            }
          }
        } else {
          c = {
            enabled: false,
            scriptUrl: '',
            render: (elementId, onsuccess) => {
              Console.info('Captcha is disabled');
              onsuccess('disabled');
            },
          }
        }
        this.config.next(c);
        return c;
      })
    );
  }

}
