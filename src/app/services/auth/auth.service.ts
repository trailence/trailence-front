import { Injectable } from '@angular/core';
import { HttpService } from '../http/http.service';
import { TrailenceHttpRequest } from '../http/http-request';
import { BehaviorSubject, EMPTY, Observable, catchError, defaultIfEmpty, filter, first, from, map, of, share, switchMap, tap, throwError, zip } from 'rxjs';
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

const LOCALSTORAGE_KEY_AUTH = 'trailence.auth';
const DB_SECURITY_PREFIX = 'trailence_security_';
const DB_SECURITY_TABLE = 'security';

/*
On first login, or when logged out, the authentication is using username + password:
 - generate a new KeyPair
 - send username + password + public key to the server
 - if succeed, store the private key in the security table

When the token is expired, auto-renewal is done:
 - send email + random + signature using private key
 - the server checks the signature and returns a new token
*/

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private readonly _auth$ = new BehaviorSubject<AuthResponse | null | undefined>(undefined);
  private db?: Dexie;
  private _currentAuth?: Observable<AuthResponse | null>;

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
        if (!url.startsWith('/login') && !url.startsWith('/link')) {
          navController.navigateRoot(['/login'], { queryParams: {returnUrl: url} });
        }
      } else if (auth) {
        Console.info('Using ' + auth.email + ', token expires at ' + new Date(auth.expires) + ' complete = ' + auth.complete);
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
      if (this._auth$.value === undefined) this._auth$.next(null);
    });
  }

  public get auth$(): Observable<AuthResponse | null> { return this._auth$.pipe(filter(auth => auth !== undefined)); }
  public get auth(): AuthResponse | null { return this._auth$.value || null; }

  public get email(): string | undefined { return this.auth?.email; }

  public preferencesUpdated(): void {
    const auth = this.auth;
    if (auth) {
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

  public login(email: string, password: string, captchaToken?: string): Observable<AuthResponse> {
    return this.generateKeys().pipe(
      switchMap(keys =>
        this.http.post<AuthResponse>(environment.apiBaseUrl + '/auth/v1/login', {
          email,
          password,
          publicKey: keys.publicKeyBase64,
          deviceInfo: new DeviceInfo(this.platform),
          captchaToken,
        } as LoginRequest)
        .pipe(
          switchMap(response =>
            from(this.openDB(response.email)
              .transaction('rw', DB_SECURITY_TABLE, tx => {
                tx.db.table<StoredSecurity, string>(DB_SECURITY_TABLE).put({email: response.email, privateKey: keys.keyPair.privateKey, keyId: response.keyId})
              })
            ).pipe(map(() => response))
          ),
          tap(response => {
            this._auth$.next(response);
          })
        )
      ),
    );
  }

  public loginWithShareLink(token: string): Observable<AuthResponse> {
    return this.generateKeys().pipe(
      switchMap(keys =>
        this.http.post<AuthResponse>(environment.apiBaseUrl + '/auth/v1/share', {
          token,
          publicKey: keys.publicKeyBase64,
          deviceInfo: new DeviceInfo(this.platform)
        } as LoginShareRequest)
        .pipe(
          switchMap(response =>
            from(this.openDB(response.email)
              .transaction('rw', DB_SECURITY_TABLE, tx => {
                tx.db.table<StoredSecurity, string>(DB_SECURITY_TABLE).put({email: response.email, privateKey: keys.keyPair.privateKey, keyId: response.keyId})
              })
            ).pipe(map(() => response))
          ),
          tap(response => {
            this._auth$.next(response);
          })
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
    if (auth) {
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

  private renewAuth(): Observable<AuthResponse | null> {
    if (!this._currentAuth) {
      if (!this._auth$.value) return of(null);
      const email = this._auth$.value.email;
      Console.info('Authenticating ' + email);
      this._currentAuth =
        from(this.db!.transaction<StoredSecurity | undefined>('r', DB_SECURITY_TABLE, tx => tx.table<StoredSecurity, string>(DB_SECURITY_TABLE).get(email)))
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
                   Console.warn('The server refused our authentication key');
                    this.db?.table<StoredSecurity, string>(DB_SECURITY_TABLE).delete(email);
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
            return this.http.post<AuthResponse>(environment.apiBaseUrl + '/auth/v1/renew', {
              email,
              random: result.randomBase64,
              keyId: result.keyId,
              signature: btoa(String.fromCharCode(...new Uint8Array(result.signature))),
              deviceInfo: new DeviceInfo(this.platform),
            } as RenewRequest);
          }),
          tap(response => this._auth$.next(response)),
          share()
        );
    }
    return this._currentAuth.pipe(
      tap(() => this._currentAuth = undefined)
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

  private addBearerToken(request: TrailenceHttpRequest): Observable<TrailenceHttpRequest> {
    if (!request.url.startsWith(environment.apiBaseUrl + '/') ||
      request.url === environment.apiBaseUrl + '/auth/v1/login' ||
      request.url === environment.apiBaseUrl + '/auth/v1/init_renew' ||
      request.url === environment.apiBaseUrl + '/auth/v1/renew' ||
      request.url === environment.apiBaseUrl + '/auth/v1/share' ||
      request.url === environment.apiBaseUrl + '/auth/v1/captcha' ||
      request.url === environment.apiBaseUrl + '/auth/v1/forgot' ||
      request.url === environment.apiBaseUrl + '/user/v1/resetPassword' ||
      (request.url.startsWith(environment.apiBaseUrl + '/user/v1/changePassword') && request.method === 'DELETE')) {
        return of(request);
      }
    return this.requireAuth().pipe(
      switchMap(auth => {
        if (!auth) {
          return EMPTY; // cancel the request
        }
        if (auth?.accessToken && auth.expires > Date.now()) {
          request.headers['Authorization'] = 'Bearer ' + auth.accessToken;
        }
        return of(request);
      })
    );
  }

}

interface StoredSecurity {
  email: string;
  privateKey: CryptoKey;
  keyId: string;
}
