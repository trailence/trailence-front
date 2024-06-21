import { CommonModule } from '@angular/common';
import { Component, Injector, Input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { TrailComponent } from 'src/app/components/trail/trail.component';
import { Trail } from 'src/app/model/trail';
import { TrailService } from 'src/app/services/database/trail.service';
import { Recording, TraceRecorderService } from 'src/app/services/trace-recorder/trace-recorder.service';
import { AbstractPage } from 'src/app/utils/component-utils';

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
  backUrl?: string;
  recording$ = new BehaviorSubject<Recording | null>(null);

  constructor(
    injector: Injector,
    route: ActivatedRoute,
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
    if (newState.owner && newState.uuid)
      this.byStateAndVisible.subscribe(
        this.trailService.getTrail$(newState.uuid, newState.owner),
        t => {
          if (this.trail$.value !== t) this.trail$.next(t);
        }
      );
    else if (this.trail$.value)
      this.trail$.next(null);
  }

}
