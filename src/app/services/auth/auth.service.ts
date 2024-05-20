import { Injectable } from '@angular/core';
import { HttpService } from '../http/http.service';
import { TrailenceHttpRequest } from '../http/http-request';
import { BehaviorSubject, Observable, filter, from, map, mergeMap, of, share, tap } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthResponse } from './auth-response';
import Dexie from 'dexie';
import { ActivatedRouteSnapshot, GuardResult, MaybeAsync, Router, RouterStateSnapshot, UrlTree } from '@angular/router';

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
    try {
      const authStored = localStorage.getItem(LOCALSTORAGE_KEY_AUTH);
      if (authStored) {
        const auth = JSON.parse(authStored) as AuthResponse;
        if (!auth.accessToken) throw Error('No accessToken');
        if (!auth.expires) throw Error('No expires');
        if (!auth.email) throw Error('No email');
        this.openDB(auth.email);
        this._auth$.next(auth);
      }
    } catch (error) {
      console.error(error);
    }
    if (this._auth$.value === undefined) this._auth$.next(null);
  }

  public get auth$(): Observable<AuthResponse | null> { return this._auth$.pipe(filter(auth => auth !== undefined)) as Observable<AuthResponse | null>; }

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
              tx.db.table<StoredSecurity, string>(DB_SECURITY_TABLE).put({email: response.email, pk: keyPair.privateKey})
            })
          ).pipe(map(() => response))
        ),
        tap(response => this._auth$.next(response))
      ))
    );
  }

  private requireAuth(): Observable<AuthResponse | null> {
    return this._auth$.pipe(
      filter(auth => auth !== undefined),
      mergeMap(auth => {
        if (!auth || auth.expires > Date.now() - 60000) return of(null);
        return this.renewAuth();
      })
    );
  }

  private renewAuth(): Observable<AuthResponse | null> {
    if (!this._currentAuth) {
      if (!this._auth$.value) return of(null);
      const email = this._auth$.value.email;
      this._currentAuth =
        from(this.db!.transaction<StoredSecurity | undefined>('r', DB_SECURITY_TABLE, tx => tx.table<StoredSecurity, string>(DB_SECURITY_TABLE).get(email)))
        .pipe(
          mergeMap(security => {
            if (!security) return of(null);
            const random = new Uint8Array(32);
            window.crypto.getRandomValues(random);
            const randomBase64 = btoa(String.fromCharCode(...random));
            return from(window.crypto.subtle.sign('RSASSA-PKCS1-v1_5', security.pk, new TextEncoder().encode(security.email + randomBase64)))
            .pipe(map(signature => ({signature, randomBase64})))
          }),
          mergeMap(signatureAndRandom => {
            if (!signatureAndRandom) return of(null);
            return this.http.post<AuthResponse>(environment.apiBaseUrl + '/auth/v1/renew', {
              email,
              random: signatureAndRandom.randomBase64,
              signature: btoa(String.fromCharCode(...new Uint8Array(signatureAndRandom.signature)))
            });
          }),
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
      request.url === environment.apiBaseUrl + '/auth/v1/renew') {
        return of(request);
      }
    return this.requireAuth().pipe(
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
  pk: CryptoKey;
}
