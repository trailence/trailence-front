import { Injectable } from '@angular/core';
import { BehaviorSubject, catchError, EMPTY, firstValueFrom, from, map, Observable, of, switchMap, tap } from 'rxjs';
import { CacheService, TimeoutCacheDb } from '../cache/cache.service';
import { HttpService } from '../http/http.service';
import { AuthService } from '../auth/auth.service';
import { environment } from 'src/environments/environment';
import { Console } from 'src/app/utils/console';
import { NetworkService } from '../network/network.service';
import { PendingRequests } from 'src/app/utils/pending-requests';
import { ApiError } from '../http/api-error';
import { ErrorService } from '../progress/error.service';

export const AVATAR_MIN_SIZE = 48;
export const AVATAR_MAX_SIZE = 128;

@Injectable({providedIn: 'root'})
export class AvatarService {

  private readonly _myDto$ = new BehaviorSubject<AvatarDto | undefined>(undefined);
  private readonly _myAvatar$: BehaviorSubject<AvatarToGenerate>;
  private readonly _cache: TimeoutCacheDb<AvatarCacheItem>;
  private readonly _pending = new PendingRequests<Blob>();

  constructor(
    readonly cacheService: CacheService,
    private readonly http: HttpService,
    private readonly authService: AuthService,
    private readonly network: NetworkService,
    private readonly errorService: ErrorService,
  ) {
    this._cache = cacheService.createTimeoutCacheDb('avatar', 60 * 60 * 1000);
    this._myAvatar$ = new BehaviorSubject<AvatarToGenerate>({letter: this.getMyLetter()} as AvatarToGenerate);
    this._myDto$.pipe(
      switchMap(dto => {
        Console.info('Avatar info', dto);
        if (!dto || !dto.hasAvatar) return of({letter: this.getMyLetter()} as AvatarToGenerate);
        return this.getAvatarToGenerate('mine*' + this.authService.email, '/current');
      })
    ).subscribe(avatar => {
      Console.info('Avatar data', avatar);
      if (!avatar) return;
      if (avatar.blob) {
        if (this._myAvatar$.value.blob === avatar.blob) return;
        this._myAvatar$.next(avatar);
      } else {
        if (this._myAvatar$.value.letter === avatar.letter) return;
        this._myAvatar$.next(avatar);
      }
    });
    authService.auth$.subscribe(auth => {
      const newDto = auth && !auth.isAnonymous ? auth.avatar : undefined;
      if (this._myDto$.value !== newDto) this._myDto$.next(newDto);
    });
  }

  public refreshMyAvatarDto(): void {
    this.authService.auth$.pipe(
      switchMap(a => {
        if (!a || a.isAnonymous) return EMPTY;
        return this.http.get<AvatarDto>(environment.apiBaseUrl + '/avatar/v1');
      })
    ).subscribe(dto => {
      this._cache.removeItem('mine*' + this.authService.email);
      this.authService.auth!.avatar = dto;
      this.authService.preferencesUpdated();
      this._myDto$.next(dto);
    });
  }

  public getMyAvatarDto$(): Observable<AvatarDto | undefined> {
    return this._myDto$;
  }

  public getMyAvatar$(): Observable<HTMLElement> {
    return this._myAvatar$.pipe(map(avatar => this.generateHtml(avatar)));
  }

  public getMyPendingAvatar$(): Observable<HTMLElement> {
    return this.getMyPendingBlob$().pipe(
      map(blob => this.generateHtml({blob}))
    );
  }

  public getMyCurrentBlob$(): Observable<Blob | undefined> {
    return this._myAvatar$.pipe(map(a => a.blob));
  }

  public getMyPendingBlob$(): Observable<Blob | undefined> {
    return this.http.getBlob(environment.apiBaseUrl + '/avatar/v1/pending');
  }

  public getOneOfMyAvatarBlobReady$(): Observable<Blob | undefined> {
    const auth = this.authService.auth;
    if (!auth || auth.isAnonymous) return of(undefined);
    const dto = this._myDto$.value;
    if (!dto || (!dto.hasAvatar && !dto.hasPending)) return of(undefined);
    const current = this._myAvatar$.value;
    if (current.blob) return of(current.blob);
    if (dto.hasAvatar && this.network.server)
      return this.getAvatarToGenerate('mine*' + this.authService.email, '/current').pipe(map(a => a?.blob));
    if (dto.hasPending && this.network.server)
      return this.http.getBlob(environment.apiBaseUrl + '/avatar/v1/pending').pipe(catchError(() => of(undefined)));
    return of(undefined);
  }

  public getAvatarByUuid$(uuid: string): Observable<HTMLElement> {
    return this.getAvatarToGenerate('public*' + uuid, '/public/' + uuid).pipe(map(a => this.generateHtml(a)));
  }

  private generateHtml(avatar: AvatarToGenerate | undefined): HTMLElement {
    if (!avatar || (!avatar.blob && !avatar.letter)) {
      const div = document.createElement('DIV');
      return div;
    }
    if (avatar.blob) {
      return this.generateFromBlob(avatar.blob);
    }
    const div = document.createElement('DIV');
    const letter = document.createTextNode(avatar.letter!);
    div.appendChild(letter);
    return div;
  }

  public generateFromBlob(blob: Blob): HTMLElement {
    const div = document.createElement('DIV');
    div.classList.add('avatar-img-container');
    const reader = new FileReader();
    reader.onloadend = () => {
      let dataUrl = reader.result as string;
      const i = dataUrl.indexOf(';base64,');
      if (i < 0) dataUrl = blob.type + ';base64,' + dataUrl;
      const img = document.createElement('IMG') as HTMLImageElement;
      img.src = dataUrl;
      div.appendChild(img);
    };
    reader.readAsDataURL(blob);
    return div;
  }

  private getMyLetter(): string {
    const email = this.authService.auth?.email;
    return email ? (this.authService.auth?.isAnonymous ? '?' : email.substring(0, 1)) : '';
  }

  private getAvatarToGenerate(key: string, request: string): Observable<AvatarToGenerate | undefined> {
    return from(this._cache.getItem(key)).pipe(
      switchMap(fromCache => {
        if (fromCache) {
          if (fromCache.blob) return of({blob: fromCache.blob});
          return of(undefined);
        }
        return this.network.server$.pipe(
          switchMap(serverAvailable => {
            if (!serverAvailable) return of(undefined);
            return from(this._pending.request(request, () => firstValueFrom(
              this.http.getBlob(environment.apiBaseUrl + '/avatar/v1' + request).pipe(
                catchError(e => {
                  if (e instanceof ApiError && e.httpCode === 404) return of(null);
                  Console.warn('Error getting avatar', e);
                  return of(null);
                }),
              )
            ))).pipe(
              map(blob => blob ? {blob} as AvatarToGenerate : undefined)
            );
          })
        );
      })
    );
  }

  public save(blob: Blob, isPublic: boolean): Observable<AvatarDto> {
    return this.http.post<AvatarDto>(environment.apiBaseUrl + '/avatar/v1', blob, {'X-Avatar-Public': '' + isPublic, 'Content-Type': 'application/octet-stream'}).pipe(
      tap(dto => {
        this._cache.removeItem('mine*' + this.authService.email);
        this.authService.auth!.avatar = dto;
        this.authService.preferencesUpdated();
        this._myDto$.next(dto);
      }),
    );
  }

  public deleteMyCurrent(): void {
    this.http.delete<AvatarDto>(environment.apiBaseUrl + '/avatar/v1/current').subscribe({
      next: dto => {
        this._cache.removeItem('mine*' + this.authService.email);
        this.authService.auth!.avatar = dto;
        this.authService.preferencesUpdated();
        this._myDto$.next(dto);
      },
      error: e => {
        this.errorService.addNetworkError(e, 'pages.preferences.delete_avatar_error', []);
      }
    });
  }

  public deleteMyPending(): void {
    this.http.delete<AvatarDto>(environment.apiBaseUrl + '/avatar/v1/pending').subscribe({
      next: dto => {
        this.authService.auth!.avatar = dto;
        this.authService.preferencesUpdated();
        this._myDto$.next(dto);
      },
      error: e => {
        this.errorService.addNetworkError(e, 'pages.preferences.delete_avatar_error', []);
      }
    });
  }

}

export interface AvatarDto {
  version: number;
  hasAvatar: boolean;
  avatarPublic: boolean;
  hasPending: boolean;
  pendingPublic: boolean;
}

interface AvatarCacheItem {
  blob?: Blob;
}

interface AvatarToGenerate {
  letter?: string;
  blob?: Blob;
}
