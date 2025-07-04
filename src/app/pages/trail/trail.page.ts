import { CommonModule } from '@angular/common';
import { Component, Injector, Input, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, of, switchMap } from 'rxjs';
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

  trail$ = new BehaviorSubject<Trail | null>(null);
  trail2$ = new BehaviorSubject<Trail | null>(null);
  title$ = new BehaviorSubject<string>('');
  backUrl?: string;
  recording$ = new BehaviorSubject<Recording | null>(null);
  menu: MenuItem[] = [];

  @ViewChild('trailComponent') trailComponent?: TrailComponent;

  constructor(
    injector: Injector,
    route: ActivatedRoute,
    private readonly trailMenuService: TrailMenuService,
    private readonly trailService: TrailService,
    traceRecorder: TraceRecorderService,
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
      this.trail$.pipe(switchMap(t => t ? t.name$ : of(undefined))),
      this.trail2$.pipe(switchMap(t => t ? t.name$ : of(undefined))),
      this.injector.get(I18nService).texts$,
    ]), ([rec, t1, t2, texts]) => {
      if (t1) {
        if (t2) {
          this.title$.next(texts.pages.trail.title_compare + ' ' + t1 + ' ' + texts.pages.trail.title_compare_and + ' ' + t2);
        } else {
          this.title$.next(t1 + (rec ? ' - ' + texts.menu.current_trace : ''));
        }
      } else if (rec) {
        this.title$.next(rec + ' - ' + texts.menu.current_trace);
      } else {
        this.title$.next('');
      }
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
          this.trailService.getTrail$(newState.uuid, newState.owner),
          newState.owner2 && newState.uuid2 ? this.trailService.getTrail$(newState.uuid2, newState.owner2) : of(null)
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
                if (item === null && (!connected || (loaded && visible))) {
                  // trail does not exist
                  Console.warn('Trail not found, redirecting to home');
                  this.ngZone.run(() => this.injector.get(Router).navigateByUrl('/'));
                }
                return of([null, null]);
              })
            )
          })
        ),
        ([t1, t2]) => {
          this.menu = t2 ? [] : this.trailMenuService.getTrailsMenu(t1 ? [t1] : [], true, t1?.collectionUuid);
          if (t1 && this.injector.get(ReplayService).canReplay) {
            this.menu.push(new MenuItem());
            this.menu.push(new MenuItem().setFixedLabel('[Dev] Replay original').setAction(() => this.injector.get(ReplayService).replay(t1.originalTrackUuid, t1.owner)));
            this.menu.push(new MenuItem().setFixedLabel('[Dev] Replay following original').setAction(() => this.injector.get(ReplayService).replay(t1.originalTrackUuid, t1.owner, t1)));
            this.menu.push(new MenuItem().setFixedLabel('[Dev] Replay current').setAction(() => this.injector.get(ReplayService).replay(t1.currentTrackUuid, t1.owner)));
            this.menu.push(new MenuItem().setFixedLabel('[Dev] Replay following current').setAction(() => this.injector.get(ReplayService).replay(t1.currentTrackUuid, t1.owner, t1)));
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
