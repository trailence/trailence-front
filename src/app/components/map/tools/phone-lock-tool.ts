import { Injector } from '@angular/core';
import L from 'leaflet';
import { MapToolUtils } from './map-tool-utils';
import { AssetsService } from 'src/app/services/assets/assets.service';
import Trailence from 'src/app/services/trailence.service';

export class PhoneLockTool extends L.Control {

  constructor(
    private readonly injector: Injector,
    options?: L.ControlOptions,
  ) {
    super(options);
  }

  private _enabled = false;

  override onAdd(map: L.Map): HTMLElement {
    const button = MapToolUtils.createButton('phone-lock-tool');
    button.style.color = '#000';
    button.style.background = '#fff';
    const assets = this.injector.get(AssetsService);
    assets.loadSvg(assets.icons['phone-lock']).subscribe(svg => button.appendChild(svg));
    Trailence.getKeepOnScreenLock({}).then(response => {
      this.setEnabled(button, response.enabled);
      button.onclick = () => {
        const newValue = !this._enabled;
        Trailence.setKeepOnScreenLock({enabled: newValue}).then(response => {
          if (response.success) this.setEnabled(button, newValue);
        });
      };
    });
    return button;
  }

  private setEnabled(button: HTMLDivElement, enabled: boolean) {
    this._enabled = enabled;
    if (this._enabled) {
      button.style.color = '#fff';
      button.style.background = '#000';
    } else {
      button.style.color = '#000';
      button.style.background = '#fff';
    }
  }

}
