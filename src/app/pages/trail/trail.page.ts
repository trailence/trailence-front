import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Injector, Input, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, map, Observable, of, switchMap } from 'rxjs';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { TrailComponent } from 'src/app/components/trail/trail.component';
import { Trail } from 'src/app/model/trail';
import { TrailMenuService } from 'src/app/services/database/trail-menu.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { Recording, TraceRecorderService } from 'src/app/services/trace-recorder/trace-recorder.service';
import { AbstractPage } from 'src/app/utils/component-utils';
import { MenuItem } from 'src/app/components/menus/menu-item';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { NetworkService } from 'src/app/services/network/network.service';
import { Console } from 'src/app/utils/console';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import { ReplayService } from 'src/app/services/replay/replay.service';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { ModerationService } from 'src/app/services/moderation/moderation.service';
import { ShareService } from 'src/app/services/database/share.service';
import { ToastController } from '@ionic/angular/standalone';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';

@Component({
    selector: 'app-trail-page',
    templateUrl: './trail.page.html',
    styleUrls: ['./trail.page.scss'],
    imports: [
        CommonModule,
        HeaderComponent,
        TrailComponent,
    ]
})
export class TrailPage extends AbstractPage {

  @Input() trailOwner?: string;
  @Input() trailId?: string;
  @Input() trailOwner2?: string;
  @Input() trailId2?: string;
  @Input() trailType?: string;

  trail$ = new BehaviorSubject<Trail | null>(null);
  trail2$ = new BehaviorSubject<Trail | null>(null);
  title = '';
  title2?: string;
  backUrl?: string;
  recording$ = new BehaviorSubject<Recording | null>(null);
  menu: MenuItem[] = [];

  titleLongPress = () => {
    const trail = this.trail$.value;
    if (trail && !this.trail2$.value && trail.owner === this.injector.get(AuthService).email)
      import('../../services/functions/trail-rename').then(m => m.openRenameTrailDialog(this.injector, trail));
  }

  @ViewChild('trailComponent') trailComponent?: TrailComponent;

  constructor(
    injector: Injector,
    route: ActivatedRoute,
    private readonly trailMenuService: TrailMenuService,
    private readonly trailService: TrailService,
    trailCollectionService: TrailCollectionService,
    traceRecorder: TraceRecorderService,
    private readonly toastController: ToastController,
    private readonly i18n: I18nService,
  ) {
    super(injector);
    this.whenAlive.add(
      route.queryParamMap.subscribe(
        params => {
          if (params.has('from')) this.backUrl = params.get('from')!;
          else this.backUrl = undefined;
        }
      )
    );
    this.whenVisible.subscribe(traceRecorder.current$, recording => {
      this.recording$.next(recording ?? null);
    });
    this.whenVisible.subscribe(combineLatest([
      this.recording$.pipe(switchMap(t => t?.trail ? t.trail.name$ : of(undefined))),
      this.trail$.pipe(
        switchMap(t => {
          if (!t) return of(undefined);
          const info$ = t.owner.indexOf('@') >= 0 ? of(undefined) : this.injector.get(FetchSourceService).getTrailInfo$(t.owner, t.uuid);
          return combineLatest([t.name$, info$]).pipe(
            switchMap(([trailName, trailInfo]) => (
                t.fromModeration || t.owner.indexOf('@') < 0 ? of(undefined) as Observable<string | undefined> :
                t.owner === this.injector.get(AuthService).email ?
                  trailCollectionService.getCollectionName$(t.collectionUuid, t.owner) :
                  this.injector.get(ShareService).getSharesFromTrailSharedWithMe(t.uuid, t.owner).pipe(map(list => list.map(s => s.name).join(', ')))
              ).pipe(
                map(cn => ({
                  trail: t,
                  trailName: trailInfo?.lang && trailInfo.lang !== this.injector.get(PreferencesService).preferences.lang && trailInfo.nameTranslations && trailInfo.nameTranslations[this.injector.get(PreferencesService).preferences.lang] ?
                    trailInfo.nameTranslations[this.injector.get(PreferencesService).preferences.lang] : trailName,
                  collectionName: cn
                }))
              )
            )
          );
        })
      ),
      this.trail2$.pipe(switchMap(t => t ? t.name$ : of(undefined))),
      this.i18n.texts$,
    ]), ([rec, t1, t2, texts]) => {
      if (t1) {
        if (t2) {
          this.title = texts.pages.trail.title_compare;
          this.title2 = t1.trailName + ' ' + texts.pages.trail.title_compare_and + ' ' + t2;
        } else {
          const colName = rec ? texts.menu.current_trace :
            (t1.collectionName ?? (
              t1.trail.fromModeration ? texts.publications.moderation.menu_title : ''
            ));
          this.title = t1.trailName;
          this.title2 = colName.length > 0 ? colName : undefined;
        }
      } else if (rec) {
        this.title = rec;
        this.title2 = texts.menu.current_trace;
      } else {
        this.title = '';
        this.title2 = undefined;
      }
      this.injector.get(ChangeDetectorRef).detectChanges();
    });
  }

  protected override getComponentState() {
    return {
      owner: this.trailOwner,
      uuid: this.trailId,
      owner2: this.trailOwner2,
      uuid2: this.trailId2,
    }
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.menu = [];
    if (newState.owner && newState.uuid) {
      this.byStateAndVisible.subscribe(
        combineLatest([
          this.trailType === 'moderation' ?
            this.injector.get(ModerationService).getTrail$(newState.uuid, newState.owner) :
            this.trailService.getTrail$(newState.uuid, newState.owner),
          newState.owner2 && newState.uuid2 ?
            this.trailService.getTrail$(newState.uuid2, newState.owner2) :
            of(null)
        ]).pipe(
          switchMap(([t1, t2]) => {
            if (t1) return of([t1, t2]);
            return combineLatest([
              this.trailService.storeLoadedAndServerUpdates$(),
              this.visible$,
              this.injector.get(NetworkService).server$,
              this.trailService.getTrail$(newState.uuid, newState.owner).pipe(
                firstTimeout<Trail | null>(item => !!item, 5000, () => null),
              ),
            ]).pipe(
              switchMap(([loaded, visible, connected, item]) => {
                if (item === null && visible && (!connected || loaded)) {
                  // trail does not exist
                  Console.warn('Trail not found, redirecting to home');
                  if (!connected)
                    this.toastController.create({
                      message: this.i18n.texts.you_are_offline,
                      duration: 2000,
                      color: 'danger',
                    }).then(t => t.present());
                  this.ngZone.run(() => this.injector.get(Router).navigateByUrl('/'));
                }
                return of([null, null]);
              })
            )
          }),
          switchMap(([t1, t2]) =>
            t1 ?
              this.injector.get(AuthService).auth$.pipe(
                switchMap(auth => auth && t1.owner === auth.email ? this.injector.get(TrailCollectionService).getCollection$(t1.collectionUuid, t1.owner) : of(undefined)),
                map(col => ({t1, t2, col}))
              )
              : of({t1, t2, col: undefined})
          )
        ),
        result => {
          const t1 = result.t1;
          const t2 = result.t2;
          const collection = result.col;
          this.menu = t2 ? [] : this.trailMenuService.getTrailsMenu(t1 ? [t1] : [], true, collection ?? undefined);
          if (t1 && this.injector.get(ReplayService).canReplay) {
            this.menu.push(new MenuItem());
            this.menu.push(new MenuItem().setFixedLabel('[Dev] Replay original').setAction(() => this.injector.get(ReplayService).replay(t1.originalTrackUuid, t1.owner)));
            this.menu.push(new MenuItem().setFixedLabel('[Dev] Replay following original').setAction(() => this.injector.get(ReplayService).replay(t1.originalTrackUuid, t1.owner, t1)));
            this.menu.push(new MenuItem().setFixedLabel('[Dev] Replay current').setAction(() => this.injector.get(ReplayService).replay(t1.currentTrackUuid, t1.owner)));
            this.menu.push(new MenuItem().setFixedLabel('[Dev] Replay following current').setAction(() => this.injector.get(ReplayService).replay(t1.currentTrackUuid, t1.owner, t1)));
            this.menu.push(new MenuItem().setFixedLabel('[Dev] Replay following current, slowly').setAction(() => this.injector.get(ReplayService).replay(t1.currentTrackUuid, t1.owner, t1, 250)));
            this.menu.push(new MenuItem().setFixedLabel('[Dev] Replay following current, approximate').setAction(() => this.injector.get(ReplayService).replay(t1.currentTrackUuid, t1.owner, t1, 50, true)));
          }
          this.trail$.next(t1);
          this.trail2$.next(t2);
        }
      );
    } else {
      this.trail$.next(null);
      this.trail2$.next(null);
    }
  }

}
