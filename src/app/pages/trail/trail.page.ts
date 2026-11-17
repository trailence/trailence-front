import { Component, Injector, Input, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, distinctUntilChanged, map, Observable, of, switchMap } from 'rxjs';
import { HeaderComponent } from '@trailence/components/header/header.component';
import { TrailComponent } from '@trailence/components/trail/trail.component';
import { Trail } from '@trailence/model/trail';
import { TrailMenuService } from '@trailence/services/database/trail-menu.service';
import { TrailService } from '@trailence/services/database/trail.service';
import { TraceRecorderService } from '@trailence/services/trace-recorder/trace-recorder.service';
import { AbstractPage } from '@trailence/utils/component-utils';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { NetworkService } from '@trailence/services/network/network.service';
import { firstTimeout } from '@trailence/utils/rxjs/first-timeout';
import { ReplayService } from '@trailence/services/replay/replay.service';
import { TrailCollectionService } from '@trailence/services/database/trail-collection.service';
import { AuthService } from '@trailence/services/auth/auth.service';
import { ModerationService } from '@trailence/services/moderation/moderation.service';
import { ShareService } from '@trailence/services/database/share.service';
import { ToastController, NavController, AlertController } from '@ionic/angular';
import { FetchSourceService } from '@trailence/services/fetch-source/fetch-source.service';
import { PreferencesService } from '@trailence/services/preferences/preferences.service';
import { TrailLinkService } from '@trailence/services/database/link.service';
import { SHARED_OWNER_PREFIX } from '@trailence/model/dto/trail-collection';
import { getLogger } from '@trailence/utils/console';

const logger = getLogger('trail.page');

@Component({
  selector: 'app-trail-page',
  templateUrl: './trail.page.html',
  styleUrls: ['./trail.page.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
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
  menu: MenuItem[] = [];

  titleLongPress = () => {
    const trail = this.trail$.value;
    if (trail && !this.trail2$.value && trail.owner === this.injector.get(AuthService).email)
      void import('../../services/functions/trail-rename').then(m => m.openRenameTrailDialog(this.injector, trail));
  }

  @ViewChild('trailComponent') trailComponent?: TrailComponent;

  constructor(
    injector: Injector,
    route: ActivatedRoute,
    private readonly trailMenuService: TrailMenuService,
    private readonly trailService: TrailService,
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
    // title
    this.whenVisible.subscribe(
      combineLatest([this.trail$, this.trail2$, traceRecorder.current$]).pipe(
        switchMap(([t1, t2, recording]) => {
          if (t1) {
            if (t2) {
              return combineLatest([
                this.getTrailName$(t1),
                this.getTrailName$(t2),
                i18n.texts$
              ]).pipe(
                map(([t1Name, t2Name, texts]) => ({
                  title: texts.pages.trail.title_compare as string,
                  title2: t1Name + ' ' + texts.pages.trail.title_compare_and + ' ' + t2Name,
                })),
              );
            }
            return combineLatest([
              this.getTrailName$(t1),
              recording ? i18n.texts$.pipe(map(texts => texts.menu.current_trace as string)) :
                (t1.fromModeration ? i18n.texts$.pipe(map(texts => texts.publications.moderation.menu_title as string)) : this.getCollectionName$(t1))
            ]).pipe(
              map(([title, title2]) => ({title, title2})),
            );
          }
          if (recording) {
            return combineLatest([
              recording.trail.name$,
              i18n.texts$.pipe(map(texts => texts.menu.current_trace as string)),
            ]).pipe(
              map(([title, title2]) => ({title, title2})),
            );
          }
          return of({title: '', title2: ''});
        }),
        distinctUntilChanged((v1, v2) => v1.title === v2.title && v1.title2 === v2.title2),
      ),
      titles => {
        this.title = titles.title;
        this.title2 = titles.title2.length > 0 ? titles.title2 : undefined;
        this.changesDetection.detectChanges();
      }
    );
  }

  private getTrailName$(trail: Trail): Observable<string> {
    if (trail.owner.includes('@')) {
      return trail.name$;
    }
    // from a plugin => we may translate the name
    return combineLatest([
      this.injector.get(FetchSourceService).getTrailInfo$(trail.owner, trail.uuid),
      this.injector.get(PreferencesService).preferences$.pipe(
        map(prefs => prefs.lang),
        distinctUntilChanged(),
      ),
    ]).pipe(
      switchMap(([trailInfo, lang]) => {
        if (trailInfo?.lang && trailInfo.lang !== lang && trailInfo.nameTranslations?.[lang])
          return of(trailInfo.nameTranslations?.[lang]);
        return trail.name$;
      }),
    );
  }

  private getCollectionName$(trail: Trail): Observable<string> {
    if (!trail.owner.includes('@')) return of('');
    if (trail.owner === this.injector.get(AuthService).email)
      return this.injector.get(TrailCollectionService).getCollectionName$(trail.collectionUuid, trail.owner);
    return this.injector.get(ShareService).getSharesFromTrailSharedWithMe(trail.uuid, trail.owner).pipe(map(list => list.map(s => s.name).join(', ')))
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
        this.injector.get(AuthService).userChanged$.pipe(
          switchMap(() => combineLatest([
            this.trailType === 'moderation' ?
              this.injector.get(ModerationService).getTrail$(newState.uuid, newState.owner) :
              this.trailService.getTrail$(newState.uuid, newState.owner),
            newState.owner2 && newState.uuid2 ?
              this.trailService.getTrail$(newState.uuid2, newState.owner2) :
              of(null)
          ])),
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
                  logger.warn('Trail not found, redirecting to home');
                  if (!connected)
                    void this.toastController.create({
                      message: this.i18n.texts.you_are_offline,
                      duration: 2000,
                      color: 'danger',
                    }).then(t => t.present());
                  this.ngZone.run(() => void this.injector.get(Router).navigateByUrl('/'));
                }
                return of([null, null]);
              })
            )
          }),
          switchMap(([t1, t2]) =>
            this.injector.get(AuthService).permissionsChanged$.pipe(
              switchMap(auth => {
                if (t1 && auth && (t1.owner === auth.email || t1.owner.startsWith(SHARED_OWNER_PREFIX)))
                  return combineLatest([
                    this.injector.get(TrailCollectionService).getCollection$(t1.collectionUuid, auth.email),
                    this.injector.get(TrailLinkService).getLinkForTrail$(t1.owner, t1.uuid)
                  ]).pipe(map(([col, link]) => ({t1, t2, col, auth})));
                return of({t1, t2, col: undefined, auth});
              })
            )
          )
        ),
        result => {
          const t1 = result.t1;
          const t2 = result.t2;
          const collection = result.col;
          this.menu = t2 ? [] : this.trailMenuService.getTrailsMenu(t1 ? [t1] : [], true, collection ?? undefined);
          if (t1 && !t2 && t1.owner === 'trailence' && result.auth?.admin) {
            this.menu.push(
              new MenuItem(),
              new MenuItem()
                .setFixedLabel('[Admin] Delete')
                .setTextColor('danger')
                .setAction(() => {
                  void this.injector.get(AlertController).create({
                    header: 'Delete public trail',
                    message: 'Confirm?',
                    buttons: [
                      {
                        text: 'Yes',
                        cssClass: 'danger',
                        role: 'ok',
                        handler: () => this.injector.get(AlertController).dismiss(null, 'ok')
                      }, {
                        text: 'Cancel',
                        role: 'cancel',
                      }
                    ]
                  })
                  .then(alert => {
                    void alert.onDidDismiss()
                    .then(result => { // NOSONAR
                      if (result.role === 'ok')
                        this.injector.get(ModerationService).deletePublicTrail(t1.uuid).subscribe({complete: () => this.injector.get(NavController).back()});
                    });
                    return alert.present();
                  });
                }),
            );
          }
          if (t1) this.injector.get(ReplayService).addTrailMenu(this.menu, t1);
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
