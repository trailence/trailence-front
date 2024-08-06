import { CommonModule } from '@angular/common';
import { Component, Injector, Input, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { TrailComponent } from 'src/app/components/trail/trail.component';
import { Trail } from 'src/app/model/trail';
import { TrailMenuService } from 'src/app/services/database/trail-menu.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { Recording, TraceRecorderService } from 'src/app/services/trace-recorder/trace-recorder.service';
import { AbstractPage } from 'src/app/utils/component-utils';
import { MenuItem } from 'src/app/utils/menu-item';
import { Platform } from '@ionic/angular/standalone';
import { AuthService } from 'src/app/services/auth/auth.service';

@Component({
  selector: 'app-trail-page',
  templateUrl: './trail.page.html',
  styleUrls: ['./trail.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    TrailComponent,
  ]
})
export class TrailPage extends AbstractPage {

  @Input() trailOwner?: string;
  @Input() trailId?: string;

  trail$ = new BehaviorSubject<Trail | null>(null);
  trail: Trail | null = null;
  backUrl?: string;
  recording$ = new BehaviorSubject<Recording | null>(null);
  menu: MenuItem[] = [];

  @ViewChild('trailComponent') trailComponent?: TrailComponent;

  constructor(
    injector: Injector,
    route: ActivatedRoute,
    private trailMenuService: TrailMenuService,
    private trailService: TrailService,
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
      this.recording$.next(recording ? recording : null);
    })
  }

  protected override getComponentState() {
    return {
      owner: this.trailOwner,
      uuid: this.trailId,
    }
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.menu = [];
    if (newState.owner && newState.uuid)
      this.byStateAndVisible.subscribe(
        this.trailService.getTrail$(newState.uuid, newState.owner),
        t => {
          this.menu = this.trailMenuService.getTrailsMenu(t ? [t] : [], true, t?.collectionUuid);
          if (t?.owner === this.injector.get(AuthService).email) {
            const platform = this.injector.get(Platform);
            if (platform.width() >= 1500 && platform.height() >= 600) {
              if (!this.injector.get(TraceRecorderService).recording) {
                // eligible for edit tools
                const sepIndex = this.menu.findIndex(item => !item.action && !item.icon && !item.label && !item.i18nLabel);
                this.menu.splice(sepIndex, 0, new MenuItem(),
                  new MenuItem().setIcon('tool').setI18nLabel('pages.trail.actions.edit_tools').setAction(() => {
                    this.trailComponent?.enableEditTools();
                  })
                );
              }
            }
          }
          if (this.trail$.value !== t) {
            this.trail$.next(t);
            this.trail = t;
          }
        }
      );
    else if (this.trail$.value) {
      this.trail$.next(null);
      this.trail = null;
    }
  }

}
