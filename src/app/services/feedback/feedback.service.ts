import { Injectable } from '@angular/core';
import { HttpService } from '../http/http.service';
import { BehaviorSubject, filter, from, map, Observable, switchMap, tap } from 'rxjs';
import { environment } from 'src/environments/environment';
import { FetchSourceService } from '../fetch-source/fetch-source.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { DynamicCacheObservables } from 'src/app/utils/rxjs/dynamic-cache-observable';
import { NetworkService } from '../network/network.service';
import { AuthService } from '../auth/auth.service';

@Injectable({providedIn: 'root'})
export class FeedbackService {

  private readonly mines = new Map<string, BehaviorSubject<MyFeedback | undefined>>();
  private readonly counts = new DynamicCacheObservables<number>(key => this.getCount(key));

  constructor(
    private readonly http: HttpService,
    private readonly network: NetworkService,
    private readonly auth: AuthService,
    private readonly fetchService: FetchSourceService,
  ) {}

  public getMyFeedback(publicTrailUuidOrSlug: string, forceRefresh: boolean = false): Observable<MyFeedback> {
    let known = this.mines.get(publicTrailUuidOrSlug);
    if (!known) {
      known = new BehaviorSubject<MyFeedback | undefined>(undefined);
      forceRefresh = true;
    }
    if (forceRefresh) {
      this.mines.set(publicTrailUuidOrSlug, known);
      this.http.get<MyFeedback>(environment.apiBaseUrl + '/public_trail_feedback/v1/' + publicTrailUuidOrSlug + '/mine').pipe(
        map(fb => ({
          rate: fb.rate ?? undefined,
          rateDate: fb.rateDate ?? undefined,
          latestCommentDate: fb.latestCommentDate ?? undefined,
        }))
      ).subscribe(fb => known.next(fb));
    }
    return known.pipe(filterDefined());
  }

  public getFeedbacks(uuid: string, pageFromDate: number, pageFromDateExclude: string[], filterRate?: number): Observable<Feedback[]> {
    return this.http.get<Feedback[]>(environment.apiBaseUrl + '/public_trail_feedback/v1/' + uuid + '?pageFromDate=' + pageFromDate + '&pageFromDateExclude=' + encodeURIComponent(pageFromDateExclude.join(',')) + (filterRate === undefined ? '' : '&filterRate=' + filterRate))
    .pipe(
      map(list => list.map(fb => {
        fb.alias = fb.alias ?? undefined;
        fb.avatarUuid = fb.avatarUuid ?? undefined;
        fb.rate = fb.rate ?? undefined;
        fb.comment = fb.comment ?? undefined;
        fb.replies = fb.replies.map(r => {
          r.alias = r.alias ?? undefined;
          r.avatarUuid = r.avatarUuid ?? undefined;
          return r;
        }).sort((r1,r2) => r1.date - r2.date);
        return fb;
      })),
    );
  }

  public countFeedbacks(uuid: string): Observable<number> {
    return this.counts.get(uuid);
  }

  private getCount(uuid: string): Observable<number> {
    return this.auth.auth$.pipe(
      filter(auth => !!auth && !auth.isAnonymous),
      switchMap(() => this.network.server$),
      filter(server => !!server),
      switchMap(() => this.http.get<number>(environment.apiBaseUrl + '/public_trail_feedback/v1/' + uuid + '/count')),
    );
  }

  public sendFeedback(trailUuid: string, rate?: number, comment?: string): Observable<any> {
    return this.http.post(environment.apiBaseUrl + '/public_trail_feedback/v1', {
      trailUuid,
      rate,
      comment,
    }).pipe(
      switchMap(response => {
        let known = this.mines.get(trailUuid);
        if (known) known.next({
          rate: rate ?? known.value?.rate,
          rateDate: rate === undefined ? known.value?.rateDate : Date.now(),
          latestCommentDate: comment === undefined || comment.trim().length === 0 ? known.value?.latestCommentDate : Date.now(),
        });
        this.counts.invalidate(trailUuid);
        return from(this.fetchService.getTrailence()!.forceRefresh(trailUuid)).pipe(map(() => response));
      })
    );
  }

  public sendReply(feedbackUuid: string, comment: string): Observable<FeedbackReply> {
    return this.http.post<FeedbackReply>(environment.apiBaseUrl + '/public_trail_feedback/v1/' + feedbackUuid, comment);
  }

  public deleteComment(feedbackUuid: string, trailUuid: string): Observable<any> {
    return this.http.delete(environment.apiBaseUrl + '/public_trail_feedback/v1/' + feedbackUuid)
    .pipe(
      tap({
        complete: () => {
          let known = this.mines.get(trailUuid);
          if (known) this.getMyFeedback(trailUuid, true);
          this.counts.invalidate(trailUuid);
        }
      })
    );
  }

  public deleteReply(uuid: string): Observable<any> {
    return this.http.delete(environment.apiBaseUrl + '/public_trail_feedback/v1/reply/' + uuid);
  }
}

export interface MyFeedback {
  rate?: number;
  rateDate?: number;
  latestCommentDate?: number;
}

export interface Feedback {
  uuid: string;
  alias?: string;
  avatarUuid?: string;
  you: boolean;
  date: number;
  rate?: number;
  comment?: string;
  replies: FeedbackReply[];
  reviewed: boolean;
}

export interface FeedbackReply {
  uuid: string;
  alias?: string;
  avatarUuid?: string;
  you: boolean;
  date: number;
  comment: string;
  reviewed: boolean;
}
