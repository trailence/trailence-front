import { Injectable } from '@angular/core';
import { HttpService } from '../http/http.service';
import { TrailenceHttpRequest } from '../http/http-request';
import { BehaviorSubject, EMPTY, Observable, catchError, filter, first, from, map, mergeMap, of, share, tap, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthResponse } from './auth-response';
import Dexie from 'dexie';
import { ActivatedRouteSnapshot, GuardResult, MaybeAsync, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { ApiError } from '../http/api-error';

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

  private _auth$ = new BehaviorSubject<AuthResponse | null | undefined>(undefined);
  private db?: Dexie;
  private _currentAuth?: Observable<AuthResponse | null>;

  constructor(
    private http: HttpService,
    private router: Router,
  ) {
    http.addRequestInterceptor(r => this.addBearerToken(r));
    this._auth$.subscribe(auth => {
      if (auth === null) {
        const url = router.routerState.snapshot.url;
        if (!url.startsWith('/login')) {
          router.navigate(['/login'], { queryParams: {returnUrl: url} });
        }
      } else if (auth) {
        console.log('Using ' + auth.email + ', token expires at ' + new Date(auth.expires));
        localStorage.setItem(LOCALSTORAGE_KEY_AUTH, JSON.stringify(auth));
      }
    });
    try {
      const authStored = localStorage.getItem(LOCALSTORAGE_KEY_AUTH);
      if (authStored) {
        const auth = JSON.parse(authStored) as AuthResponse;
        if (!auth.accessToken) throw Error('No accessToken');
        if (!auth.expires) throw Error('No expires');
        if (!auth.email) throw Error('No email');
        if (!auth.keyId) throw Error('No keyId');
        console.log('Found stored authentication for user', auth.email);
        this.openDB(auth.email);
        this._auth$.next(auth);
      }
    } catch (error) {
      console.error(error);
    }
    if (this._auth$.value === undefined) this._auth$.next(null);
  }

  public get auth$(): Observable<AuthResponse | null> { return this._auth$.pipe(filter(auth => auth !== undefined)) as Observable<AuthResponse | null>; }
  public get auth(): AuthResponse | null { return this._auth$.value || null; }

  public get email(): string | undefined { return this.auth?.email; }

  public preferencesUpdated(): void {
    const auth = this.auth;
    if (auth) {
      localStorage.setItem(LOCALSTORAGE_KEY_AUTH, JSON.stringify(auth));
    }
  }

  public guardAuthenticated(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): MaybeAsync<GuardResult> {
    if (this._auth$.value) return true;
    return this._auth$.pipe(
      filter(auth => auth !== undefined),
      map(auth => {
        if (auth) return true;
        return this.router.createUrlTree(['/login'], {queryParams: {returnUrl: state.url}});
      })
    );
  }

  public login(email: string, password: string): Observable<AuthResponse> {
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
      mergeMap(keyPair => from(window.crypto.subtle.exportKey('spki', keyPair.publicKey)).pipe(
        mergeMap(pk =>
          this.http.post<AuthResponse>(environment.apiBaseUrl + '/auth/v1/login', {
            email, password, publicKey: btoa(String.fromCharCode(...new Uint8Array(pk)))
          })
        ),
        mergeMap(response =>
          from(this.openDB(response.email)
            .transaction('rw', DB_SECURITY_TABLE, tx => {
              tx.db.table<StoredSecurity, string>(DB_SECURITY_TABLE).put({email: response.email, privateKey: keyPair.privateKey, keyId: response.keyId})
            })
          ).pipe(map(() => response))
        ),
        tap(response => {
          this._auth$.next(response);
        })
      ))
    );
  }

  private requireAuth(): Observable<AuthResponse | null> {
    return this._auth$.pipe(
      filter(auth => auth !== undefined),
      mergeMap(auth => {
        console.log('requires auth, current token expires in ', auth ? (auth.expires - Date.now()) : 'null');
        if (!auth || auth.expires > Date.now() - 60000) return of(auth as (AuthResponse | null));
        console.log('renew auth');
        return this.renewAuth();
      }),
      first()
    );
  }

  private renewAuth(): Observable<AuthResponse | null> {
    if (!this._currentAuth) {
      if (!this._auth$.value) return of(null);
      const email = this._auth$.value.email;
      console.log('Authenticating ' + email);
      this._currentAuth =
        from(this.db!.transaction<StoredSecurity | undefined>('r', DB_SECURITY_TABLE, tx => tx.table<StoredSecurity, string>(DB_SECURITY_TABLE).get(email)))
        .pipe(
          mergeMap(security => {
            if (!security) {
              this._auth$.next(null);
              return of(null);
            }
            return this.http.post<{random:string}>(environment.apiBaseUrl + '/auth/v1/init_renew', {email: security.email, keyId: security.keyId})
            .pipe(
              mergeMap(initResponse =>
                from(window.crypto.subtle.sign('RSASSA-PKCS1-v1_5', security.privateKey, new TextEncoder().encode(security.email + initResponse.random)))
                .pipe(map(signature => ({signature, randomBase64: initResponse.random, keyId: security.keyId})))
              ),
              catchError(error => {
                if (error instanceof ApiError) {
                  if (error.httpCode === 403) {
                    console.log('The server refused our authentication key');
                    this.db?.table<StoredSecurity, string>(DB_SECURITY_TABLE).delete(email);
                    this._auth$.next(null);
                    return of(null);
                  }
                }
                return throwError(() => error);
              })
            )
          }),
          mergeMap(result => {
            if (!result) return of(null);
            return this.http.post<AuthResponse>(environment.apiBaseUrl + '/auth/v1/renew', {
              email,
              random: result.randomBase64,
              keyId: result.keyId,
              signature: btoa(String.fromCharCode(...new Uint8Array(result.signature)))
            });
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
      request.url === environment.apiBaseUrl + '/auth/v1/renew') {
        return of(request);
      }
    return this.requireAuth().pipe(
      mergeMap(auth => {
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
