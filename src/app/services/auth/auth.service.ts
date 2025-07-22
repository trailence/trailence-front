import { Injectable } from '@angular/core';
import { HttpService } from '../http/http.service';
import { TrailenceHttpRequest } from '../http/http-request';
import { BehaviorSubject, Observable, Subscriber, catchError, defaultIfEmpty, filter, first, from, map, of, switchMap, tap, throwError, zip } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthResponse } from './auth-response';
import Dexie from 'dexie';
import { ActivatedRouteSnapshot, GuardResult, MaybeAsync, NavigationEnd, NavigationStart, Router, RouterStateSnapshot } from '@angular/router';
import { ApiError } from '../http/api-error';
import { LoginRequest } from './login-request';
import { DeviceInfo } from './device-info';
import { Platform, NavController } from '@ionic/angular/standalone';
import { InitRenewRequest } from './init-renew-request';
import { RenewRequest } from './renew-request';
import { LoginShareRequest } from './login-share-request';
import { Console } from 'src/app/utils/console';
import { UserQuotas } from './user-quotas';
import { publicRoutes } from 'src/app/routes/package.routes';

export const ANONYMOUS_USER = 'anonymous@trailence.org';

const LOCALSTORAGE_KEY_AUTH = 'trailence.auth';
const LOCALSTORAGE_KEY_ANONYMOUS_PREFS = 'trailence.anonymous_preferences';
const DB_SECURITY_PREFIX = 'trailence_security_';
const DB_SECURITY_TABLE = 'security';

const KEY_EXPIRATION_WEB = 31 * 24 * 60 * 60 * 1000; // 31 days
const KEY_EXPIRATION_NATIVE = 6 * 31 * 24 * 60 * 60 * 1000; // 6 months
const RENEW_KEY_AFTER_WEB = 7 * 24 * 60 * 60 * 1000; // 7 days
const RENEW_KEY_AFTER_NATIVE = 31 * 24 * 60 * 60 * 1000; // 31 days

/*
On first login, or when logged out, the authentication is using username + password:
 - generate a new KeyPair
 - send username + password + public key to the server
 - if succeed, store the private key in the security table

When the token is expired, auto-renewal is done:
 - send email + random + signature using private key
 - the server checks the signature and returns a new token

After RENEW_KEY_AFTER_xxx the key is renewed together with the token:
 - generate a new KeyPair
 - renew sending the new public key
 - the server responds with the new token, and removed the previous key
*/

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private readonly _auth$ = new BehaviorSubject<AuthResponse | null | undefined>(undefined);
  private db?: Dexie;
  private _currentAuth?: Subscriber<AuthResponse | null>[];

  constructor(
    private readonly http: HttpService,
    private readonly router: Router,
    private readonly platform: Platform,
    navController: NavController,
  ) {
    http.addRequestInterceptor(r => this.addBearerToken(r));
    this._auth$.subscribe(auth => {
      if (auth === null) {
        const url = window.location.pathname;
        if (url.indexOf('/login') < 0 && url.indexOf('/link') < 0 && url !== '/search-route' && !url.startsWith('/trail/trailence/')) {
          if (!publicRoutes.find(r => '/' + r.path === url || '/fr/' + r.path === url || '/en/' + r.path === url)) {
            if (url === '/')
              navController.navigateRoot(['/home']);
            else
              navController.navigateRoot(['/login'], { queryParams: {returnUrl: url} });
          }
        }
      } else if (auth) {
        Console.info(
          'Using ' + auth.email +
          ', token expires at ' + new Date(auth.expires).toISOString() +
          ', complete = ' + auth.complete +
          ', admin = ' + auth.admin +
          ', key expires at ' + new Date(auth.keyExpiresAt).toISOString() +
          ', renew key after ' + new Date(auth.keyCreatedAt + (this.platform.is('capacitor') ? RENEW_KEY_AFTER_NATIVE : RENEW_KEY_AFTER_WEB)).toISOString()
        );
        localStorage.setItem(LOCALSTORAGE_KEY_AUTH, JSON.stringify(auth));
      }
    });
    router.events.subscribe(e => {
      if (e instanceof NavigationStart) {
        Console.debug('Navigate to ' + e.url);
      } else if (e instanceof NavigationEnd) {
        Console.debug('Navigation done to ' + e.url);
      }
    });
    router.events.pipe(
      filter(e => {
        if (e instanceof NavigationStart) {
          if (!e.url.startsWith("/link/")) return true;
        }
        return false;
      }),
      first(),
    ).subscribe(() => {
      if (this._auth$.value !== undefined) return;
      try {
        const authStored = localStorage.getItem(LOCALSTORAGE_KEY_AUTH);
        if (authStored) {
          const auth = JSON.parse(authStored) as AuthResponse;
          if (!auth.accessToken) throw Error('No accessToken');
          if (!auth.expires) throw Error('No expires');
          if (!auth.email) throw Error('No email');
          if (!auth.keyId) throw Error('No keyId');
          Console.info('Found stored authentication for user', auth.email);
          this.openDB(auth.email);
          this._auth$.next(auth);
        }
      } catch (error) {
        Console.error(error);
      }
      if (this._auth$.value === undefined) {
        Console.info('Not authenticated');
        this._auth$.next(null);
      }
    });
  }

  public get auth$(): Observable<AuthResponse | null> { return this._auth$.pipe(filter(auth => auth !== undefined)); }
  public get auth(): AuthResponse | null { return this._auth$.value ?? null; }

  public get email(): string | undefined { return this.auth?.email; }
  public hasRole(role: string): boolean { return !!this.auth?.roles?.find(r => r === role); }
  public hasRole$(role: string): Observable<boolean> { return this.auth$.pipe(map(a => !!a?.roles?.find(r => r === role))); }

  public preferencesUpdated(): void {
    const auth = this.auth;
    if (auth) {
      localStorage.setItem(LOCALSTORAGE_KEY_AUTH, JSON.stringify(auth));
      if (auth.isAnonymous)
        localStorage.setItem(LOCALSTORAGE_KEY_ANONYMOUS_PREFS, JSON.stringify(auth.preferences));
    }
  }

  public quotasUpdated(quotas: UserQuotas): void {
    const auth = this.auth;
    if (auth) {
      auth.quotas = quotas;
      localStorage.setItem(LOCALSTORAGE_KEY_AUTH, JSON.stringify(auth));
    }
  }

  public completed(): void {
    if (this._auth$.value && !this._auth$.value.complete) {
      this._auth$.value.complete = true;
      this._auth$.next(this._auth$.value);
    }
  }

  public guardAuthenticated(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): MaybeAsync<GuardResult> {
    return this._auth$.pipe(
      filter(auth => auth !== undefined),
      map(auth => {
        if (auth) return true;
        return this.router.createUrlTree(['/login'], {queryParams: {returnUrl: state.url}});
      })
    );
  }

  public guardAdmin(): MaybeAsync<GuardResult> {
    return this._auth$.pipe(
      filter(auth => auth !== undefined),
      map(auth => {
        if (auth?.admin) return true;
        return this.router.createUrlTree(['/']);
      })
    );
  }

  public login(email: string, password: string, captchaToken?: string): Observable<AuthResponse> {
    return this.loginAndStoreKey(
      publicKeyBase64 => this.http.post<AuthResponse>(environment.apiBaseUrl + '/auth/v1/login', {
        email,
        password,
        publicKey: publicKeyBase64,
        deviceInfo: new DeviceInfo(this.platform),
        captchaToken,
        expiresAfter: this.platform.is('capacitor') ? KEY_EXPIRATION_NATIVE : KEY_EXPIRATION_WEB,
      } as LoginRequest)
    );
  }

  public loginWithShareLink(token: string): Observable<AuthResponse> {
    return this.loginAndStoreKey(
      publicKeyBase64 => this.http.post<AuthResponse>(environment.apiBaseUrl + '/auth/v1/share', {
        token,
        publicKey: publicKeyBase64,
        deviceInfo: new DeviceInfo(this.platform)
      } as LoginShareRequest)
    );
  }

  private loginAndStoreKey(loginRequest: (publicKeyBase64: string) => Observable<AuthResponse>): Observable<AuthResponse> {
    return this.generateKeys().pipe(
      switchMap(keys =>
        loginRequest(keys.publicKeyBase64)
        .pipe(
          tap(response => {
            this._auth$.next(response);
          }),
          switchMap(response =>
            from(this.openDB(response.email)
              .transaction('rw', DB_SECURITY_TABLE, tx =>
                tx.db.table<StoredSecurity, string>(DB_SECURITY_TABLE).put({email: response.email, privateKey: keys.keyPair.privateKey, keyId: response.keyId})
              )
            ).pipe(map(() => response))
          )
        )
      ),
    );
  }

  private generateKeys(): Observable<{keyPair: CryptoKeyPair, publicKeyBase64: string}> {
    return from(window.crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      false,
      ['sign', 'verify']
    )).pipe(
      switchMap(keyPair =>
        from(window.crypto.subtle.exportKey('spki', keyPair.publicKey)).pipe(
          map(pk => ({keyPair: keyPair, publicKeyBase64: btoa(String.fromCharCode(...new Uint8Array(pk)))}))
        )
      )
    );
  }

  public loginAnonymous(): Observable<AuthResponse> {
    let preferences = {};
    try {
      preferences = JSON.parse(localStorage.getItem(LOCALSTORAGE_KEY_ANONYMOUS_PREFS) ?? '{}');
    } catch (e) { /* ignore */ } // NOSONAR
    const response: AuthResponse = {
      accessToken: 'anonymous',
      expires: 99999999999999,
      email: ANONYMOUS_USER,
      keyId: '1',
      keyCreatedAt: Date.now(),
      keyExpiresAt: 99999999999999,
      preferences,
      complete: false,
      admin: false,
      quotas: {
        collectionsUsed: 0,
        collectionsMax: 10,
        trailsUsed: 0,
        trailsMax: 10000,
        tracksUsed: 0,
        tracksMax: 25000,
        tracksSizeUsed: 0,
        tracksSizeMax: 100000000,
        photosUsed: 0,
        photosMax: 1000,
        photosSizeUsed: 0,
        photosSizeMax: 1000000000,
        tagsUsed: 0,
        tagsMax: 1000,
        trailTagsUsed: 0,
        trailTagsMax: 100000,
        sharesUsed: 0,
        sharesMax: 0,
      },
      allowedExtensions: [],
      isAnonymous: true,
    };
    this._auth$.next(response);
    return of(response);
  }

  public logout(withDelete: boolean): Observable<any> {
    const email = this.email;
    if (!email) return of(true);
    if (withDelete) {
      for (let i = 0; i < localStorage.length; ++i) {
        const key = localStorage.key(i);
        if (key?.startsWith('trailence')) {
          localStorage.removeItem(key);
          i--;
        }
      }
      return from(Dexie.getDatabaseNames())
      .pipe(
        switchMap(names => {
          const deletes: Observable<any>[] = [];
          for (const name of names) {
            if (name.startsWith('trailence_') && name.endsWith('_' + email)) {
              deletes.push(from(Dexie.delete(name)));
            }
          }
          return deletes.length === 0 ? of(true) : zip(deletes);
        }),
        defaultIfEmpty(true),
        switchMap(() => this.doLogout())
      )
    }
    return this.doLogout();
  }

  private doLogout(): Observable<any> {
    localStorage.removeItem(LOCALSTORAGE_KEY_AUTH);
    const auth = this._auth$.value;
    if (auth && !auth.isAnonymous) {
      this.http.delete(environment.apiBaseUrl + '/auth/v1/mykeys/' + auth.keyId).subscribe();
    }
    if (this.db) {
      const db = this.db;
      db.delete().then(() => db.close());
      this.db = undefined;
    }
    this._auth$.next(null);
    return of(true);
  }

  private requireAuth(): Observable<AuthResponse | null> {
    return this._auth$.pipe(
      filter(auth => auth !== undefined),
      switchMap(auth => {
        if (!auth || auth.expires - Date.now() - 60000 > 0) return of(auth);
        return this.renewAuth();
      }),
      first()
    );
  }

  public forceRenew(): void {
    this.renewAuth().subscribe();
  }

  private renewAuth(): Observable<AuthResponse | null> {
    return new Observable<AuthResponse | null>(
      subscriber => {
        if (!this._currentAuth) {
          const subscribers = [subscriber];
          this._currentAuth = subscribers;
          this.doRenewAuth().subscribe({
            next: result => {
              this._currentAuth = undefined;
              for (const s of subscribers) {
                s.next(result);
                s.complete();
              }
            },
          });
        } else {
          this._currentAuth.push(subscriber);
        }
      }
    );
  }

  private doRenewAuth(): Observable<AuthResponse | null> {
    const current = this._auth$.value;
    if (!current || current.isAnonymous) return of(null);
    Console.info('Authenticating ' + current.email);
    return from(this.db!.transaction<StoredSecurity | undefined>('r', DB_SECURITY_TABLE, tx => tx.table<StoredSecurity, string>(DB_SECURITY_TABLE).get(current.email)))
    .pipe(
      switchMap(security => {
        if (!security) {
          this._auth$.next(null);
          return of(null);
        }
        return this.http.post<{random:string}>(environment.apiBaseUrl + '/auth/v1/init_renew', {email: security.email, keyId: security.keyId} as InitRenewRequest)
        .pipe(
          switchMap(initResponse =>
            from(window.crypto.subtle.sign('RSASSA-PKCS1-v1_5', security.privateKey, new TextEncoder().encode(security.email + initResponse.random)))
            .pipe(map(signature => ({signature, randomBase64: initResponse.random, keyId: security.keyId})))
          ),
          catchError(error => {
            if (error instanceof ApiError) {
              if (error.httpCode === 403) {
                Console.warn('The server refused our authentication key id ' + security.keyId);
                this.db?.table<StoredSecurity, string>(DB_SECURITY_TABLE).delete(current.email);
                this._auth$.next(null);
                return of(null);
              }
            }
            return throwError(() => error);
          })
        )
      }),
      switchMap(result => {
        if (!result) return of(null);
        const request = {
          email: current.email,
          random: result.randomBase64,
          keyId: result.keyId,
          signature: btoa(String.fromCharCode(...new Uint8Array(result.signature))),
          deviceInfo: new DeviceInfo(this.platform),
        } as RenewRequest;
        if (current.keyCreatedAt + (this.platform.is('capacitor') ? RENEW_KEY_AFTER_NATIVE : RENEW_KEY_AFTER_WEB) > Date.now())
          return this.http.post<AuthResponse>(environment.apiBaseUrl + '/auth/v1/renew', request);
        // renew the key
        Console.info("Renew token with new key pair");
        return this.generateKeys().pipe(
          switchMap(keys => {
            request.newPublicKey = keys.publicKeyBase64;
            request.newKeyExpiresAfter = this.platform.is('capacitor') ? KEY_EXPIRATION_NATIVE : KEY_EXPIRATION_WEB;
            return this.http.post<AuthResponse>(environment.apiBaseUrl + '/auth/v1/renew', request).pipe(
              switchMap(response =>
                from(this.db!.transaction('rw', DB_SECURITY_TABLE, tx =>
                  tx.db.table<StoredSecurity, string>(DB_SECURITY_TABLE).put({email: response.email, privateKey: keys.keyPair.privateKey, keyId: response.keyId})
                ))
                .pipe(map(() => response))
              )
            );
          }),
        );
      }),
      tap(response => this._auth$.next(response))
    );
  }

  private openDB(email: string): Dexie {
    if (this.db) this.db.close();
    const db = new Dexie(DB_SECURITY_PREFIX + email);
    const stores: any = {};
    stores[DB_SECURITY_TABLE] = 'email';
    db.version(1).stores(stores);
    this.db = db;
    return db;
  }

  private addBearerToken(request: TrailenceHttpRequest): Observable<TrailenceHttpRequest> | TrailenceHttpRequest {
    if (!request.url.startsWith(environment.apiBaseUrl + '/') ||
      request.url === environment.apiBaseUrl + '/auth/v1/login' ||
      request.url === environment.apiBaseUrl + '/auth/v1/init_renew' ||
      request.url === environment.apiBaseUrl + '/auth/v1/renew' ||
      request.url === environment.apiBaseUrl + '/auth/v1/share' ||
      request.url === environment.apiBaseUrl + '/auth/v1/captcha' ||
      request.url === environment.apiBaseUrl + '/auth/v1/forgot' ||
      request.url === environment.apiBaseUrl + '/user/v1/resetPassword' ||
      request.url === environment.apiBaseUrl + '/user/v1/sendRegisterCode' ||
      request.url === environment.apiBaseUrl + '/user/v1/registerNewUser' ||
      (request.url.startsWith(environment.apiBaseUrl + '/user/v1/changePassword') && request.method === 'DELETE') ||
      (request.url.startsWith(environment.apiBaseUrl + '/user/v1/sendDeletionCode') && request.method === 'DELETE')) {
        return request;
      }
    const optional =
      request.url === environment.apiBaseUrl + '/contact/v1' ||
      request.url === environment.apiBaseUrl + '/donation/v1/status' ||
      (request.url.startsWith(environment.apiBaseUrl + '/public/') && !request.url.endsWith('/mine'))
      ;
    return this.requireAuth().pipe(
      filter(auth => {
        if (auth || optional) return true;
        Console.warn('Request cancelled because no authentication', request.url);
        return false; // cancel request if not authenticated
      }),
      map(auth => {
        if (auth?.accessToken && auth.expires > Date.now()) {
          request.headers['Authorization'] = 'Bearer ' + auth.accessToken;
        }
        return request;
      })
    );
  }

}

interface StoredSecurity {
  email: string;
  privateKey: CryptoKey;
  keyId: string;
}
