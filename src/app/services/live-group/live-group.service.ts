import { Injectable, Injector } from '@angular/core';
import { HttpService } from '../http/http.service';
import { NetworkService } from '../network/network.service';
import { BehaviorSubject, catchError, combineLatest, debounceTime, defaultIfEmpty, EMPTY, filter, interval, map, Observable, Subscription, switchMap, tap } from 'rxjs';
import { environment } from 'src/environments/environment';
import { GeolocationService } from '../geolocation/geolocation.service';
import { AuthService } from '../auth/auth.service';
import { deviceId } from '../auth/device-info';
import { I18nService } from '../i18n/i18n.service';
import { PointDto } from 'src/app/model/dto/point';
import { POSITION_FACTOR } from 'src/app/model/point-dto-mapper';
import { Router } from '@angular/router';
import { Console } from 'src/app/utils/console';
import { GeolocationState } from '../geolocation/geolocation.interface';
import { AlertController } from '@ionic/angular/standalone';

const LATEST_GROUPS_KEY_PREFIX = 'trailence.latest_live_groups.';

@Injectable({providedIn: 'root'})
export class LiveGroupService {

  private _currentId = '';
  private readonly _groups$ = new BehaviorSubject<LiveGroupDto[] | undefined>(undefined);
  private readonly _forceUpdate$ = new BehaviorSubject<any>(undefined);
  private _paused$ = new BehaviorSubject<boolean>(false);

  constructor(
    private readonly http: HttpService,
    private readonly network: NetworkService,
    private readonly geolocation: GeolocationService,
    private readonly authService: AuthService,
    private readonly i18n: I18nService,
    private readonly router: Router,
    private readonly injector: Injector,
  ) {
    this.init();
  }

  public get groups$() { return this._groups$; }

  public updateNow(): void {
    this._forceUpdate$.next(undefined);
  }

  private init(): void {
    combineLatest([this.network.server$, this.authService.auth$]).pipe(
      switchMap(([connected, auth]) => {
        const newId = auth && !auth.isAnonymous ? auth.email : 'anonymous$' + deviceId();
        if (newId !== this._currentId) {
          this._currentId = newId;
          this.stopListening();
          this._groups$.next(undefined);
        }
        if (!connected) {
          const key = LATEST_GROUPS_KEY_PREFIX + (this.authService.email || '$');
          const stored = localStorage.getItem(key);
          if (stored) {
            try {
              const groups = JSON.parse(stored) as LiveGroupDto[];
              this.updateGroups(groups);
            } catch (e) {}
          }
          return EMPTY;
        }
        return this.http.get<LiveGroupDto[]>(environment.apiBaseUrl + '/live-group/v1' + (newId.includes('@') ? '' : '?id=' + newId));
      }),
      catchError(e => {
        Console.warn("Error getting live groups", e);
        return EMPTY;
      })
    ).subscribe(groups => this.updateGroups(this.decodeGroups(groups)));
  }

  private listenToGroupsSubscription: Subscription | undefined;
  private _geolocationListener: (position: PointDto) => void = () => {};
  private listenToGroups(askGps: boolean): void {
    this.listenToGroupsSubscription?.unsubscribe();
    this.listenToGroupsSubscription =
      combineLatest([interval(30000), this.network.server$, this._forceUpdate$.pipe(debounceTime(250))])
      .pipe(
        filter(([i, connected, updateRequested]) => connected),
        switchMap(() => {
          const currentPos = this.geolocation.lastKnownPosition;
          const lat = currentPos?.position?.l;
          const lng = currentPos?.position?.n;
          const tim = currentPos?.timestamp;
          const hasPos = lat !== undefined && lat !== null && lng !== undefined && lng !== null && tim !== undefined && tim !== null;
          return this.http.put<LiveGroupDto[]>(environment.apiBaseUrl + '/live-group/v1', {
            memberId: this._currentId.includes('@') ? undefined : this._currentId,
            position: hasPos ? {lat: lat * POSITION_FACTOR, lng: lng * POSITION_FACTOR} : undefined,
            positionAt: hasPos ? tim : undefined,
          }).pipe(
            catchError(e => {
              Console.warn("Error listening to live groups", e);
              return EMPTY;
            })
          )
        })
      ).subscribe(groups => this.updateGroups(this.decodeGroups(groups)));
    this.watchPosition(askGps);
  }

  private watching = false;
  private watchPosition(ask: boolean): void {
    this.geolocation.getState()
    .then(state => {
      if (state === GeolocationState.DISABLED) {
        if (!ask) return;
        const alertController = this.injector.get(AlertController);
        alertController.create({
          header: this.i18n.texts.trace_recorder.disabled_popup.title,
          message: this.i18n.texts.trace_recorder.disabled_popup.message,
          backdropDismiss: false,
          buttons: [{
            text: this.i18n.texts.buttons.retry,
            role: 'ok',
            handler: () => {
              alertController.dismiss();
              this.watchPosition(true);
            }
          }, {
            text: this.i18n.texts.buttons.cancel,
            role: 'cancel',
            handler: () => {
              alertController.dismiss();
              Console.info('User cancel GPS: cannot watch for live groups');
            }
          }]
        }).then(alert => alert.present());
      } else if (state === GeolocationState.DENIED) {
        Console.error('Geolocation access denied by user: cannot watch for live groups');
      } else {
        this.watching = true;
        this.geolocation.watchPosition(this.i18n.texts.trace_recorder.notif_message, this._geolocationListener);
      }
    });
  }

  private stopListening(): void {
    this.listenToGroupsSubscription?.unsubscribe();
    this.listenToGroupsSubscription = undefined;
    this.watching = false;
    this.geolocation.stopWatching(this._geolocationListener);
  }

  public get paused$(): Observable<boolean> { return this._paused$; }
  public get paused(): boolean { return this._paused$.value; }

  public resume(): void {
    if (!this._paused$.value) return;
    this._paused$.next(false);
    if (this._informListeningShown || !this._groups$.value?.length) return;
    this.listenToGroups(true);
  }

  public pause(): void {
    if (this._paused$.value) return;
    this._paused$.next(true);
    this.stopListening();
  }

  private decodeGroups(groups: LiveGroupDto[]): LiveGroupDto[] {
    return groups.map(g => this.decodeGroup(g)).sort((g1, g2) => g1.startedAt - g2.startedAt);
  }

  private decodeGroup(group: LiveGroupDto): LiveGroupDto {
    group.members = group.members.map(m => ({...m, lastPosition: this.decodePosition(m.lastPosition)}));
    group.updatedAt = Date.now();
    return group;
  }

  private decodePosition(p: {lat: number, lng: number} | undefined | null): {lat: number, lng: number} | undefined {
    return p ? {lat: p.lat / POSITION_FACTOR, lng: p.lng / POSITION_FACTOR} : undefined;
  }

  private updateGroups(groups: LiveGroupDto[]): void {
    if (groups.length === 0) {
      this.stopListening();
    } else if (!this._paused$.value) {
      if (!this._groups$.value?.length) {
        this.informListening();
      } else if (!this.watching && !this._informListeningShown) {
        this.listenToGroups(false);
      }
    }
    const key = LATEST_GROUPS_KEY_PREFIX + (this.authService.email || '$');
    localStorage.setItem(key, JSON.stringify(groups));
    this._groups$.next(groups);
  }

  public createGroup(request: LiveGroupRequest): Observable<LiveGroupDto> {
    return this.http.post<LiveGroupDto>(environment.apiBaseUrl + '/live-group/v1', request)
    .pipe(
      map(group => this.decodeGroup(group)),
      tap(group => this.updateGroups([...(this._groups$.value || []), group]))
    );
  }

  public updateGroup(slug: string, request: LiveGroupRequest): Observable<LiveGroupDto> {
    return this.http.put<LiveGroupDto>(environment.apiBaseUrl + '/live-group/v1/' + slug, request)
    .pipe(
      map(group => this.decodeGroup(group)),
      tap(group => {
        const newGroups = [...(this._groups$.value || [])];
        const index = newGroups.findIndex(g => g.slug === slug);
        if (index < 0) newGroups.push(group);
        else newGroups.splice(index, 1, group);
        this.updateGroups(newGroups);
      })
    );
  }

  public joinGroup(slug: string, myName: string): Observable<LiveGroupDto> {
    return this.http.post<LiveGroupDto>(environment.apiBaseUrl + '/live-group/v1/join/' + slug + (this._currentId.includes('@') ? '' : '?id=' + this._currentId), myName)
    .pipe(
      map(group => this.decodeGroup(group)),
      tap(group => {
        const newGroups = [...(this._groups$.value || [])];
        const index = newGroups.findIndex(g => g.slug === slug);
        if (index < 0) newGroups.push(group);
        else newGroups.splice(index, 1, group);
        this.updateGroups(newGroups);
      })
    );
  }

  public removeGroup(slug: string): Observable<any> {
    return this.http.delete(environment.apiBaseUrl + '/live-group/v1/' + slug).pipe(
      defaultIfEmpty(null),
      tap(() => {
        const newGroups = [...(this._groups$.value || [])];
        const index = newGroups.findIndex(g => g.slug === slug);
        if (index < 0) return;
        newGroups.splice(index, 1);
        this.updateGroups(newGroups);
      })
    );
  }

  public leaveGroup(slug: string): Observable<any> {
    return this.http.delete(environment.apiBaseUrl + '/live-group/v1/join/' + slug + (this._currentId.includes('@') ? '' : '?id=' + this._currentId)).pipe(
      defaultIfEmpty(null),
      tap(() => {
        const newGroups = [...(this._groups$.value || [])];
        const index = newGroups.findIndex(g => g.slug === slug);
        if (index < 0) return;
        newGroups.splice(index, 1);
        this.updateGroups(newGroups);
      })
    );
  }

  public openLiveGroup(group: LiveGroupDto): void {
    if (group.trailOwner && group.trailUuid)
      this.router.navigate(['trail', group.trailOwner, group.trailUuid], {fragment: 'bottom-tab=live-group'});
    else
      this.router.navigateByUrl('/live-group/' + group.slug);
  }

  private _informListeningShown = false;
  private informListening(): void {
    this._informListeningShown = true;
    const alertController = this.injector.get(AlertController);
    alertController.create({
      header: this.i18n.texts.pages.live_group.title,
      message: this.i18n.texts.pages.live_group.listening_info_message,
      buttons: [
        {
          text: this.i18n.texts.buttons.understood,
          role: 'ok',
          handler: () => {
            alertController.dismiss();
            this._informListeningShown = false;
            if (this._groups$.value?.length) this.listenToGroups(true);
          }
        }, {
          text: this.i18n.texts.buttons.cancel,
          role: 'cancel',
          handler: () => {
            alertController.dismiss();
            this._informListeningShown = false;
            this._paused$.next(true);
          }
        }
      ]
    }).then(a => a.present());
  }

}

export interface LiveGroupDto {
  slug: string;
  name: string;
  startedAt: number;
  expiresAt: number;
  trailOwner: string;
  trailUuid: string;
  trailShared: boolean;
  members: LiveGroupMemberDto[];
  updatedAt: number;
}

export interface LiveGroupMemberDto {
  uuid: string;
  name: string;
  lastPosition: {lat: number, lng: number} | null | undefined;
  lastPositionAt: number | null | undefined;
  you: boolean;
  owner: boolean;
}

export interface LiveGroupRequest {
  groupName: string;
  myName?: string;
  trailOwner?: string;
  trailUuid?: string;
  trailShared?: boolean;
}
