import { Injector } from '@angular/core';
import L from 'leaflet';
import { MapToolUtils } from './map-tool-utils';
import { AssetsService } from 'src/app/services/assets/assets.service';
import { MapLayersService } from 'src/app/services/map/map-layers.service';

export class DarkMapToggle extends L.Control {

  constructor(
    private readonly injector: Injector,
    options?: L.ControlOptions,
  ) {
    super(options);
  }

  override onAdd(map: L.Map): HTMLElement {
    this.injector.get(MapLayersService).applyDarkMap(map);
    const button = MapToolUtils.createButton('dark-map-tool');
    button.style.color = '#000';
    const assets = this.injector.get(AssetsService);
    let iconDark: any, iconLight: any;
    assets.loadSvg(assets.icons['theme-dark']).subscribe(
      svg => {
        iconDark = svg;
        if (!this.injector.get(MapLayersService).darkMapEnabled) {
          button.appendChild(iconDark);
        }
      }
    );
    assets.loadSvg(assets.icons['theme-light']).subscribe(
      svg => {
        iconLight = svg;
        if (this.injector.get(MapLayersService).darkMapEnabled) {
          button.appendChild(iconLight);
        }
      }
    );
    button.onclick = () => {
      this.injector.get(MapLayersService).toggleDarkMap();
      let icon;
      if (this.injector.get(MapLayersService).darkMapEnabled) {
        icon = iconLight;
      } else {
        icon = iconDark;
      }
      if (icon) {
        if (button.children.length > 0) button.removeChild(button.children.item(0)!);
        button.appendChild(icon);
      }
    };
    return button;
  }

}
