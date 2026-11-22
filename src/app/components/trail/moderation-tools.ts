import { Track } from '@trailence/model/track';
import { Trail } from '@trailence/model/trail';
import { FetchSourceService } from '@trailence/services/fetch-source/fetch-source.service';
import { ErrorService } from '@trailence/services/progress/error.service';
import { MapTrackPath } from '../map/elements/map-track-path';
import { bboxPadRatio } from '@trailence/utils/latlng';
import { Color } from '@trailence/utils/color';
import { BehaviorSubject, filter, firstValueFrom, map, Observable, switchMap } from 'rxjs';
import { AbstractComponent } from '@trailence/utils/component-utils';
import { AppEventListener } from '@trailence/utils/events';
import { MapPointerEvent } from '../map/map-events';
import { environment } from '@env/environment';
import { AnyMapElement } from '../map/map-element';
import { MenuItem } from '../menus/menu-item';
import { ModerationService } from '@trailence/services/moderation/moderation.service';

export class ModerationTools {

  constructor(
    private readonly component: AbstractComponent<any>,
    public readonly trail: Trail,
    public readonly track: Track,
  ) {
    const publicTrackListener: AppEventListener<{mapElement: MapTrackPath, element: Track, pointerEvent: MapPointerEvent}> = (event) => {
      window.open(environment.baseUrl + '/trail/trailence/' + event.mapElement.trail!.uuid, '_blank');
    };
    component.whenAlive.add(
      this._publicTrailsAroundMapTracks$.subscribe(
        tracks => {
          for (const track of tracks) {
            track.events.click.addListenerIfAbsent(publicTrackListener);
          }
        }
      )
    );
    if (trail.publishedFromUuid) {
      component.injector.get(ModerationService).getPublicUuid(trail.publishedFromUuid!, trail.owner)
      .subscribe(uuid => {
        this._currentPublicTrailUuid = uuid;
        this.toolbarItems$.next(this.toolbarItems$.value);
      });
    }
  }

  private _isShowPublicTrailsAround = false;
  private _showTextHtml = false;
  private _currentPublicTrailUuid?: string;
  private _compareWithCurrentPublic = false;

  private readonly _publicTrailsAroundMapTracks$ = new BehaviorSubject<MapTrackPath[]>([]);

  public readonly mapElements$: Observable<AnyMapElement[]> = this._publicTrailsAroundMapTracks$;
  public readonly toolbarItems$ = new BehaviorSubject<MenuItem[]>([
    new MenuItem().setIcon('compare').setI18nLabel('publications.compare_current')
      .setVisible(() => !!this._currentPublicTrailUuid && !this._isShowPublicTrailsAround && !this._compareWithCurrentPublic)
      .setAction(() => this.compareToPublicTrail()),
    new MenuItem().setIcon('compare').setI18nLabel('publications.exit_compare_current')
      .setVisible(() => !!this._currentPublicTrailUuid && this._compareWithCurrentPublic)
      .setAction(() => this.exitCompareToPublicTrail()),
    new MenuItem().setIcon('privacy').setI18nLabel('publications.check_public_trails_around')
      .setVisible(() => !this._isShowPublicTrailsAround)
      .setAction(() => this.showPublicTrailsAround()),
    new MenuItem().setIcon('privacy').setI18nLabel('publications.exit_check_public_trails_around')
      .setVisible(() => this._isShowPublicTrailsAround)
      .setBadgeTopRight(() => ({text: '' + this._publicTrailsAroundMapTracks$.value.length, color: undefined, fill: undefined}))
      .setAction(() => this.hidePublicTrailsAround()),
    new MenuItem().setIcon('text').setI18nLabel('publications.show_html_text')
      .setVisible(() => !this._showTextHtml)
      .setAction(() => this.setShowHtml(true)),
    new MenuItem().setIcon('text').setI18nLabel('publications.exit_show_html_text')
      .setVisible(() => this._showTextHtml)
      .setAction(() => this.setShowHtml(false)),
  ]);
  public readonly compareWithTrail$ = new BehaviorSubject<Trail | undefined>(undefined);
  public get showTextHtml() { return this._showTextHtml; }
  public get currentPublicTrailUuid() { return this._currentPublicTrailUuid; }

  private setShowHtml(show: boolean): void {
    this._showTextHtml = show;
    this.toolbarItems$.next(this.toolbarItems$.value);
  }

  private showPublicTrailsAround(): void {
    this._isShowPublicTrailsAround = true;
    this.checkPublicTrailsAround(this.track, (tracks) => {
      if (this._isShowPublicTrailsAround) {
        this._publicTrailsAroundMapTracks$.next(tracks);
        this.toolbarItems$.next(this.toolbarItems$.value);
      }
    });
    this.toolbarItems$.next(this.toolbarItems$.value);
  }

  private hidePublicTrailsAround(): void {
    this._isShowPublicTrailsAround = false;
    this._publicTrailsAroundMapTracks$.next([]);
    this.toolbarItems$.next(this.toolbarItems$.value);
  }

  private checkPublicTrailsAround(track: Track, listener: (mapTracks: MapTrackPath[]) => void) {
    const trailence = this.component.injector.get(FetchSourceService).getPluginByName('Trailence');
    if (!trailence) return;
    let bounds = track.metadata.bounds;
    if (!bounds) return;
    bounds = bboxPadRatio(bounds, 1);
    const trails: Trail[] = [];
    trailence.ready$.pipe(
      filter(Boolean),
      switchMap(() => trailence.searchByArea(bounds, 100))
    ).subscribe(
      result => {
        trails.push(...result.trails);
        if (!result.end) return;
        Promise.all(
          trails.map(trail => trailence.getFullTrack(trail.uuid).then(t => ({trail, track: t})))
        ).then(trailsAndTracks => {
          const list = trailsAndTracks.filter(t => !!t.track) as ({trail: Trail, track: Track}[]);
          const mapTracks = list.map(item => new MapTrackPath(item.trail, item.track, Color.parse('#FF60FFA0'), false, 4));
          listener(mapTracks);
        }).catch(e => this.component.injector.get(ErrorService).addError(e));
      }
    );
  }

  private async compareToPublicTrail() {
    this._compareWithCurrentPublic = false;
    this.compareWithTrail$.next(undefined);
    this.toolbarItems$.next(this.toolbarItems$.value);
    const trailence = await firstValueFrom(this.component.injector.get(FetchSourceService).getTrailence$().pipe(switchMap(t => t.ready$.pipe(filter(Boolean), map(() => t)))));
    if (!this._currentPublicTrailUuid) return;
    const trail = await trailence.getTrail(this._currentPublicTrailUuid);
    if (!trail) {
      this.component.injector.get(ErrorService).addError(new Error('Cannot find current trail'));
      return;
    }
    this._compareWithCurrentPublic = true;
    this.compareWithTrail$.next(trail);
    this.toolbarItems$.next(this.toolbarItems$.value);
  }

  private exitCompareToPublicTrail() {
    this._compareWithCurrentPublic = false;
    this.compareWithTrail$.next(undefined);
    this.toolbarItems$.next(this.toolbarItems$.value);
  }

}
