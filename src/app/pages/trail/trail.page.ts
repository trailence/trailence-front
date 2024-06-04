import { CommonModule } from '@angular/common';
import { Component, Injector, Input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { TrailComponent } from 'src/app/components/trail/trail.component';
import { Trail } from 'src/app/model/trail';
import { TrailService } from 'src/app/services/database/trail.service';
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

  constructor(
    injector: Injector,
    route: ActivatedRoute,
    private trailService: TrailService,
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
