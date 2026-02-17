import { Injectable } from '@angular/core';
import { HttpService } from '../http/http.service';
import { NetworkService } from '../network/network.service';
import { BehaviorSubject, catchError, combineLatest, debounceTime, defaultIfEmpty, EMPTY, filter, interval, map, Observable, Observer, Subscription, switchMap, tap, timer } from 'rxjs';
import { environment } from 'src/environments/environment';
import { GeolocationService } from '../geolocation/geolocation.service';
import { AuthService } from '../auth/auth.service';
import { deviceId } from '../auth/device-info';
import { I18nService } from '../i18n/i18n.service';
import { PointDto } from 'src/app/model/dto/point';
import { POSITION_FACTOR } from 'src/app/model/point-dto-mapper';
import { Router } from '@angular/router';
import { Console } from 'src/app/utils/console';

@Injectable({providedIn: 'root'})
export class LiveGroupService {

  private _currentId = '';
  private readonly _groups$ = new BehaviorSubject<LiveGroupDto[] | undefined>(undefined);
  private readonly _forceUpdate$ = new BehaviorSubject<any>(undefined);

  constructor(
    private readonly http: HttpService,
    private readonly network: NetworkService,
    private readonly geolocation: GeolocationService,
    private readonly authService: AuthService,
    private readonly i18n: I18nService,
    private readonly router: Router,
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
        if (!connected) return EMPTY;
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
  private listenToGroups(): void {
    this.listenToGroupsSubscription?.unsubscribe();
    this.listenToGroupsSubscription =
      combineLatest([interval(60000), this.network.server$, this._forceUpdate$.pipe(debounceTime(250))])
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
    this.geolocation.watchPosition(this.i18n.texts.trace_recorder.notif_message, this._geolocationListener);
  }

  private stopListening(): void {
    this.listenToGroupsSubscription?.unsubscribe();
    this.listenToGroupsSubscription = undefined;
    this.geolocation.stopWatching(this._geolocationListener);
  }

  private decodeGroups(groups: LiveGroupDto[]): LiveGroupDto[] {
    return groups.map(g => this.decodeGroup(g));
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
    } else if (!this._groups$.value?.length) {
      this.listenToGroups();
    }
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
