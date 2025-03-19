import { Injector } from '@angular/core';
import L from 'leaflet';
import { MapToolUtils } from './map-tool-utils';
import { AssetsService } from 'src/app/services/assets/assets.service';
import { Trail } from 'src/app/model/trail';

export class DownloadMapTool extends L.Control {

  constructor(
    private readonly injector: Injector,
    private readonly trail: Trail | undefined,
    options?: L.ControlOptions,
  ) {
    super(options);
  }

  override onAdd(map: L.Map): HTMLElement {
    const button = MapToolUtils.createButton('download-map-tool');
    button.style.color = map.getZoom() < 12 ? '#A0A0A0' : '#000000';
    const assets = this.injector.get(AssetsService);
    assets.loadSvg(assets.icons['download']).subscribe(
      svg => {
        svg.style.width = '32px';
        svg.style.height = '32px';
        svg.style.margin = '3px 3px -2px 3px';
        button.appendChild(svg);
      }
    );
    map.on('zoom', () => {
      button.style.color = map.getZoom() < 12 ? '#A0A0A0' : '#000000';
    });
    button.onclick = () => {
      if (map.getZoom() < 12) return;
      import('../../../services/functions/map-download')
      .then(m => m.openMapDownloadDialog(this.injector, this.trail ? [this.trail] : [], map.getBounds()));
    };
    return button;
  }

}
