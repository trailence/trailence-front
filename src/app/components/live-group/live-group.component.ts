import { ChangeDetectorRef, Component, Injector, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { LiveGroupDto, LiveGroupMemberDto, LiveGroupService } from 'src/app/services/live-group/live-group.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { IonIcon, AlertController, IonButton } from '@ionic/angular/standalone';
import { RelativeDateComponent } from '../relative-date/relative-date.component';
import { MapComponent } from '../map/map.component';
import { firstValueFrom, map, Observable, of, Subscription, switchMap } from 'rxjs';
import * as L from 'leaflet';
import { MenuItem } from '../menus/menu-item';
import { ToolbarComponent } from '../menus/toolbar/toolbar.component';
import { NetworkService } from 'src/app/services/network/network.service';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth/auth.service';
import { defaultAuthRoute, defaultPublicRoute } from 'src/app/routes/package.routes';
import { I18nPipe } from 'src/app/services/i18n/i18n-string';

@Component({
  selector: 'app-live-group',
  templateUrl: './live-group.component.html',
  styleUrl: './live-group.component.scss',
  imports: [
    IonIcon, IonButton,
    RelativeDateComponent,
    ToolbarComponent,
    I18nPipe,
  ],
})
export class LiveGroupComponent implements OnInit, OnChanges, OnDestroy {

  @Input() group!: LiveGroupDto;
  @Input() orientation: 'horizontal' | 'vertical' = 'vertical';
  @Input() mapComponent$!: Observable<MapComponent | undefined>;
  @Input() autoFitMap = false;
  @Input() showTitle = true;

  members: LiveGroupMemberDto[] = [];
  highlighted?: LiveGroupMemberDto;
  networkAvailable = false;

  toolbar: MenuItem[] = [
    new MenuItem().setIcon('edit').setI18nLabel('buttons.edit')
      .setDisabled(() => !this.network.server)
      .setVisible(() => this.group.members.some(m => m.you && m.owner))
      .setAction(() => import('./live-group-popup.component').then(m => m.openEditLiveGroupPopup(this.injector, this.group, undefined, undefined))),
    new MenuItem().setIcon('edit').setI18nLabel('pages.live_group.rename_me')
      .setDisabled(() => !this.network.server)
      .setVisible(() => !this.group.members.some(m => m.you && m.owner))
      .setAction(() => this.renameMe()),
    new MenuItem().setIcon('link').setI18nLabel('pages.live_group.link_button')
      .setAction(() => import('./live-group-link-popup.component').then(m => m.openLiveGroupLinkPopup(this.injector, this.group))),

    new MenuItem().setIcon('stop').setI18nLabel('pages.live_group.stop').setTextColor('danger')
      .setDisabled(() => !this.network.server)
      .setVisible(() => this.group.members.some(m => m.you && m.owner))
      .setAction(() => this.leave()),
    new MenuItem().setIcon('logout').setI18nLabel('pages.live_group.leave').setTextColor('danger')
      .setDisabled(() => !this.network.server)
      .setVisible(() => this.group.members.some(m => m.you && !m.owner))
      .setAction(() => this.leave()),
  ];

  private networkSubscription?: Subscription;
  private mapSubscription?: Subscription;
  private mapComponent?: MapComponent;
  private mapReady = false;

  constructor(
    public readonly i18n: I18nService,
    private readonly prefService: PreferencesService,
    private readonly injector: Injector,
    private readonly liveGroupService: LiveGroupService,
    private readonly changeDetector: ChangeDetectorRef,
    public readonly network: NetworkService,
  ) {}

  ngOnInit(): void {
    this.networkSubscription = this.network.server$.subscribe(n => {
      this.networkAvailable = n;
      this.toolbar = [...this.toolbar];
      this.changeDetector.detectChanges();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.updateMembers();
    this.mapSubscription?.unsubscribe();
    this.mapSubscription = this.mapComponent$.pipe(
      switchMap(c => c ? c.ready$.pipe(map(r => [c,r] as [MapComponent | undefined, boolean])) : of([undefined, false] as [MapComponent | undefined, boolean]))
    ).subscribe(m => {
      this.mapComponent = m[0];
      this.mapReady = m[1];
      this.updateMap();
    });
    this.toolbar = [...this.toolbar];
  }

  ngOnDestroy(): void {
    this.networkSubscription?.unsubscribe();
    this.mapSubscription?.unsubscribe();
    if (this.mapComponent) {
      this.mapComponent.removeFitBoundsProvider(this.mapBoundsProvider);
      if (this._mapComponentShowPositionDisabled === this.mapComponent)
        this.mapComponent.disableShowPosition$.next(this.mapComponent.disableShowPosition$.value - 1);
      this._mapComponentShowPositionDisabled = undefined;
    }
    this.mapComponent = undefined;
    this.mapReady = false;
    this.updateMap();
  }

  private updateMembers(): void {
    this.members = this.group.members.sort((m1, m2) => m1.name.localeCompare(m2.name, this.prefService.preferences.lang));
    const h = this.highlighted?.uuid;
    this.highlighted = this.members.find(m => m.uuid === h);
  }

  toggleHighlightMember(member: LiveGroupMemberDto): void {
    if (this.highlighted === member)
      this.highlighted = undefined;
    else {
      this.highlighted = member;
      if (this.mapComponent && member.lastPosition)
        this.mapComponent.ensurePointVisible(member.lastPosition);
    }
    this.updateMap();
    this.changeDetector.detectChanges();
  }

  updateNow(): void {
    this.liveGroupService.updateNow();
  }

  private markers: L.CircleMarker[] = [];
  private highlightedTooltip?: L.Tooltip;
  private mapBoundsProvider: () => L.LatLngBounds | undefined = () => {
    let bounds: L.LatLngBounds | undefined = undefined;
    for (const marker of this.markers) {
      if (!bounds) bounds = L.latLngBounds(marker.getLatLng(), marker.getLatLng());
      else bounds = bounds.extend(marker.getLatLng());
    }
    return bounds;
  };
  private _mapComponentShowPositionDisabled?: MapComponent;

  private updateMap(): void {
    const nbMarkersBefore = this.markers.length;
    this.markers.forEach(m => m.remove());
    this.markers = [];
    this.highlightedTooltip?.remove();
    this.highlightedTooltip = undefined;
    if (this.mapReady && this.mapComponent && this.group) {
      if (this._mapComponentShowPositionDisabled !== this.mapComponent) {
        this.mapComponent.disableShowPosition$.next(this.mapComponent.disableShowPosition$.value + 1);
        this._mapComponentShowPositionDisabled = this.mapComponent;
      }
      let you: L.CircleMarker | undefined = undefined;
      for (const member of this.group.members) {
        if (!member.lastPosition) continue;
        const marker = new L.CircleMarker(member.lastPosition, {
          radius: 5,
          color: member.you ? 'blue' : '#FF00FF',
          opacity: 0.75,
          fillColor: member.you ? 'blue' : '#FF00FF',
          fillOpacity: 0.33,
          stroke: true,
          className: 'leaflet-position-marker',
          pane: 'markerPane',
        });
        marker.addEventListener('click', () => this.toggleHighlightMember(member));
        this.markers.push(marker);
        this.mapComponent.addToMap(marker);
        if (member.you) you = marker;
        if (this.highlighted?.uuid === member.uuid) {
          const span = document.createElement('SPAN');
          span.innerText = member.name;
          this.highlightedTooltip = L.tooltip({className: 'poi', permanent: true}).setLatLng(member.lastPosition).setContent(span.outerHTML);
          this.highlightedTooltip.setOpacity(0.75);
          this.mapComponent.addToMap(this.highlightedTooltip);
        }
      }
      if (you) you.bringToFront();

      if (this.markers.length > 0 && nbMarkersBefore != this.markers.length && this.autoFitMap) {
        const bounds = this.mapBoundsProvider();
        if (bounds) this.mapComponent.centerAndZoomOn(bounds.pad(0.05));
      }
      this.mapComponent.addFitBoundsProvider(this.mapBoundsProvider);
    } else {
      this._mapComponentShowPositionDisabled = undefined;
    }
  }

  private leave(): void {
    const type = this.group.members.some(m => m.owner && m.you) ? 'stop' : 'leave';
    const alertController = this.injector.get(AlertController);
    alertController.create({
      header: this.i18n.texts.pages.live_group.confirm[type].title,
      message: '',
      buttons: [
        {
          text: this.i18n.texts.buttons.confirm,
          role: 'danger',
          handler: () => {
            alertController.dismiss();
            if (this.injector.get(Router).url.startsWith('/live-group/'))
              this.injector.get(Router).navigateByUrl(this.injector.get(AuthService).auth ? defaultAuthRoute : defaultPublicRoute);
            if (type === 'stop') this.liveGroupService.removeGroup(this.group.slug).subscribe();
            else this.liveGroupService.leaveGroup(this.group.slug).subscribe();
          }
        }, {
          text: this.i18n.texts.buttons.cancel,
          role: 'cancel'
        }
      ]
    }).then(a => {
      a.querySelector('div.alert-message')!.innerHTML = this.i18n.texts.pages.live_group.confirm[type].message;
      a.present();
    });
  }

  renameMe(): void {
    const alertController = this.injector.get(AlertController);
    alertController.create({
      header: this.i18n.texts.pages.live_group.rename_me,
      inputs: [
        {
          type: 'text',
          placeholder: this.i18n.texts.pages.live_group.my_name,
          value: this.group.members.find(m => m.you)?.name || '',
          attributes: {
            maxlength: 25,
            counter: true,
          }
        }
      ],
      buttons: [
        {
          text: this.i18n.texts.buttons.ok,
          role: 'ok',
          handler: data => {
            const name = data[0].trim();
            if (name.length === 0 || name.length > 25) return false;
            return firstValueFrom(this.liveGroupService.joinGroup(this.group.slug, name)).then(() => true);
          }
        }, {
          text: this.i18n.texts.buttons.cancel,
          role: 'cancel'
        }
      ]
    }).then(a => a.present());
  }

}
