import { Component, Injector, Input } from '@angular/core';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { Platform } from '@ionic/angular';
import { Trail } from 'src/app/model/trail';
import { TrailsListComponent } from '../trails-list/trails-list.component';
import { TrackMetadataDisplayMode } from '../track-metadata/track-metadata.component';
import { Observable } from 'rxjs';
import { IonSegment, IonSegmentButton } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
  selector: 'app-trails-and-map',
  templateUrl: './trails-and-map.component.html',
  styleUrls: ['./trails-and-map.component.scss'],
  standalone: true,
  imports: [IonSegmentButton, IonSegment, 
    TrailsListComponent,
  ]
})
export class TrailsAndMapComponent extends AbstractComponent {

  @Input() trails$?: Observable<Observable<Trail | null>[]>;
  @Input() collectionUuid?: string;

  mode =  '';
  listType: TrackMetadataDisplayMode = 'TWO_COLUMNS';
  tab = 'map';

  constructor(
    injector: Injector,
    private platform: Platform,
    public i18n: I18nService,
  ) {
    super(injector);
    this.whenVisible.subscribe(platform.resize, () => this.updateMode());
  }

  protected override initComponent(): void {
    this.updateMode();
  }

  setTab(tab: string): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.updateMode();
  }

  private updateMode(): void {
    const w = this.platform.width();
    const h = this.platform.height();
    if (w >= 750 + 350) {
      this.mode = 'large list-two-cols';
      this.listType = 'TWO_COLUMNS';
    } else if (w >= 700 + 175) {
      this.mode = 'large list-one-col';
      this.listType = 'SINGLE_COLUMN';
    } else if (h > w) {
      this.mode = 'small vertical ' + this.tab;
      this.listType = w >= 350 ? 'TWO_COLUMNS' : 'SINGLE_COLUMN';
    } else {
      this.mode = 'small horizontal ' + this.tab;
      this.listType = w >= 350 ? 'TWO_COLUMNS' : 'SINGLE_COLUMN';
    }
  }

}
