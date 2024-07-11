import { Injector } from '@angular/core';
import * as L from 'leaflet';
import { MapToolUtils } from './map-tool-utils';
import { AssetsService } from 'src/app/services/assets/assets.service';
import { TrailService } from 'src/app/services/database/trail.service';

export class DownloadMapTool extends L.Control {

  constructor(
    private injector: Injector,
    options?: L.ControlOptions,
  ) {
    super(options);
  }

  override onAdd(map: L.Map): HTMLElement {
    const button = MapToolUtils.createButton();
    button.style.color = map.getZoom() < 12 ? '#A0A0A0' : '#000000';
    const assets = this.injector.get(AssetsService);
    assets.loadText(assets.icons['download'], true).subscribe(
      svg => {
        const icon = svg.cloneNode(true) as any;
        icon.style.width = '32px';
        icon.style.height = '32px';
        icon.style.margin = '3px 3px -2px 3px';
        button.appendChild(icon);
      }
    );
    map.on('zoom', () => {
      button.style.color = map.getZoom() < 12 ? '#A0A0A0' : '#000000';
    });
    button.onclick = () => {
      if (map.getZoom() < 12) return;
      this.injector.get(TrailService).openDownloadMap([], map.getBounds());
    };
    return button;
  }

}
