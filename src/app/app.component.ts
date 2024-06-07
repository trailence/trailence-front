import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet, IonContent, IonMenu } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { I18nService } from './services/i18n/i18n.service';
import { TrackService } from './services/database/track.service';
import { TrailService } from './services/database/trail.service';
import { TrailCollectionService } from './services/database/trail-collection.service';
import { TagService } from './services/database/tag.service';
import { AssetsService } from './services/assets/assets.service';
import { MenuComponent } from './components/menu/menu.component';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  standalone: true,
  imports: [
    IonApp,
    IonMenu,
    IonContent,
    IonRouterOutlet,
    CommonModule,
    MenuComponent,
  ],
})
export class AppComponent {
  constructor(
    public i18n: I18nService,
    // init assets
    assetsService: AssetsService,
    // depends on services with stores, so they can start synchronizing
    trackService: TrackService,
    trailService: TrailService,
    collectionService: TrailCollectionService,
    tagService: TagService,
  ) {
  }
}
