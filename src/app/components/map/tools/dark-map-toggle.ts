import { Injector } from '@angular/core';
import * as L from 'leaflet';
import { MapToolUtils } from './map-tool-utils';
import { AssetsService } from 'src/app/services/assets/assets.service';
import { MapLayersService } from 'src/app/services/map/map-layers.service';

export class DarkMapToggle extends L.Control {

  constructor(
    private injector: Injector,
    options?: L.ControlOptions,
  ) {
    super(options);
  }

  override onAdd(map: L.Map): HTMLElement {
    const button = MapToolUtils.createButton();
    button.style.color = '#000';
    const assets = this.injector.get(AssetsService);
    let iconDark: any, iconLight: any;
    assets.loadSvg(assets.icons['theme-dark']).subscribe(
      svg => {
        iconDark = svg;
        iconDark.style.width = '32px';
        iconDark.style.height = '32px';
        iconDark.style.margin = '3px 3px -2px 3px';
        if (!this.injector.get(MapLayersService).darkMapEnabled) {
          button.appendChild(iconDark);
        }
      }
    );
    assets.loadSvg(assets.icons['theme-light']).subscribe(
      svg => {
        iconLight = svg;
        iconLight.style.width = '32px';
        iconLight.style.height = '32px';
        iconLight.style.margin = '3px 3px -2px 3px';
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
