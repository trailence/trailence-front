import * as L from 'leaflet';
import { MapToolUtils } from './map-tool-utils';
import { Observable, Subscription } from 'rxjs';
import { Injector } from '@angular/core';
import { AssetsService } from 'src/app/services/assets/assets.service';

export class MapCenterOnPositionTool extends L.Control {

  constructor(
    private readonly injector: Injector,
    private readonly following$: Observable<boolean>,
    options?: L.ControlOptions,
  ) {
    super(options);
  }

  private subscription?: Subscription;

  override onAdd(map: L.Map) {
    const button = MapToolUtils.createButton('center-on-location-tool');
    button.style.color = 'black';
    const assets = this.injector.get(AssetsService);
    assets.loadSvg(assets.icons['center-on-location']).subscribe(
      svg => {
        svg.style.width = '26px';
        svg.style.height = '26px';
        svg.style.margin = '3px 3px -2px 3px';
        button.appendChild(svg);
      }
    );
    this.subscription = this.following$.subscribe(
      following => button.style.color = following ? 'red' : 'black'
    );
    button.onclick = async (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      map.fireEvent('centerOnLocation');
    };
    return button;
  }

  override onRemove(map: L.Map): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }
}
