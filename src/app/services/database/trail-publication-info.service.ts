import { Injectable } from '@angular/core';
import { MyPublicTrail, MyPublicTrailsService } from './my-public-trails.service';
import { TrailLinkService } from './link.service';
import { TrailService } from './trail.service';
import { AuthService } from '../auth/auth.service';
import { BehaviorSubject, combineLatest, map, Observable, of, switchMap } from 'rxjs';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { TrailCollectionService } from './trail-collection.service';
import { SHARED_OWNER_PREFIX, TrailCollectionType } from 'src/app/model/dto/trail-collection';
import { TrailLink } from 'src/app/model/dto/trail-link';
import { TrailCollection } from 'src/app/model/trail-collection';
import { Trail } from 'src/app/model/trail';

interface PublicationsData {
  email: string | undefined,
  publicTrails: MyPublicTrail[],
  links: TrailLink[],
  draftCol: TrailCollection | undefined,
  submitCol: TrailCollection | undefined,
  rejectCol: TrailCollection | undefined,
  publicationTrails: Trail[],
}

const EMPTY_DATA: PublicationsData = {email: undefined, publicTrails: [], links: [], draftCol: undefined, submitCol: undefined, rejectCol: undefined, publicationTrails: []};

export interface TrailPublicationInfo {
  draft: Trail | undefined,
  submitted: Trail | undefined,
  rejected: Trail | undefined,
  link: TrailLink | undefined,
  published: MyPublicTrail | undefined,
}

const EMPTY_TRAIL_INFO: TrailPublicationInfo = {draft: undefined, submitted: undefined, rejected: undefined, link: undefined, published: undefined};

@Injectable({providedIn: 'root'})
export class TrailPublicationInfoService {

  private readonly _data$ = new BehaviorSubject<PublicationsData>(EMPTY_DATA);

  constructor(
    authService: AuthService,
    publicTrailsService: MyPublicTrailsService,
    linkService: TrailLinkService,
    trailService: TrailService,
    collectionService: TrailCollectionService,
  ) {
    authService.userChanged$.pipe(
      switchMap(auth => {
        if (!auth || auth.isAnonymous) return of(EMPTY_DATA);
        return combineLatest([
          publicTrailsService.myPublicTrails$,
          linkService.getAllWhenReady$().pipe(collection$items()),
          trailService.getAllWhenLoaded$().pipe(collection$items(t => !!t.publishedFromUuid)),
          collectionService.getAllCollectionsReady$(),
        ]).pipe(
          map(([publicTrails, links, publicationTrails, collections]): PublicationsData => ({
            email: auth.email,
            publicTrails, links,
            draftCol: collections.find(c => c.type === TrailCollectionType.PUB_DRAFT),
            submitCol: collections.find(c => c.type === TrailCollectionType.PUB_SUBMIT),
            rejectCol: collections.find(c => c.type === TrailCollectionType.PUB_REJECT),
            publicationTrails,
          }))
        )
      })
    ).subscribe(data => {
      if (this._data$.value !== data) this._data$.next(data);
    });
  }

  public getTrailPublicationInfo(trail: Trail): Observable<TrailPublicationInfo> {
    return this._data$.pipe(
      map((data): TrailPublicationInfo => {
        if (!data.email || (trail.owner !== data.email && !trail.owner.startsWith(SHARED_OWNER_PREFIX))) return EMPTY_TRAIL_INFO;
        return {
          draft: data.draftCol && trail.owner === data.email ? data.publicationTrails.find(t => t.publishedFromUuid === trail.uuid && t.collectionUuid === data.draftCol!.uuid) : undefined,
          submitted: data.submitCol && trail.owner === data.email ? data.publicationTrails.find(t => t.publishedFromUuid === trail.uuid && t.collectionUuid === data.submitCol!.uuid) : undefined,
          rejected: data.rejectCol && trail.owner === data.email ? data.publicationTrails.find(t => t.publishedFromUuid === trail.uuid && t.collectionUuid === data.rejectCol!.uuid) : undefined,
          link: data.links.find(l => l.trailUuid === trail.uuid && l.trailOwner === trail.owner),
          published: trail.owner === data.email ? data.publicTrails.find(p => p.privateUuid === trail.uuid) : undefined,
        }
      }),
    );
  }

}
