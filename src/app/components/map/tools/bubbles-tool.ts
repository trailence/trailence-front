import * as L from 'leaflet';
import { MapToolUtils } from './map-tool-utils';
import { Observable, Subscription } from 'rxjs';
import { Injector } from '@angular/core';
import { AssetsService } from 'src/app/services/assets/assets.service';

export class MapBubblesTool extends L.Control {

  constructor(
    private injector: Injector,
    private activated$: Observable<boolean>,
    options?: L.ControlOptions,
  ) {
    super(options);
  }

  private subscription?: Subscription;

  override onAdd(map: L.Map) {
    const button = MapToolUtils.createButton();
    button.style.color = 'black';
    const assets = this.injector.get(AssetsService);
    let svgOn: SVGSVGElement, svgOff: SVGSVGElement;
    let activated = false;
    assets.loadSvg(assets.icons['bubbles']).subscribe(
      svg => {
        svgOn = svg;
        svg.style.width = '32px';
        svg.style.height = '32px';
        svg.style.margin = '3px 3px -2px 3px';
        if (!activated)
          button.appendChild(svg);
      }
    );
    assets.loadSvg(assets.icons['path']).subscribe(
      svg => {
        svgOff = svg;
        svg.style.width = '32px';
        svg.style.height = '32px';
        svg.style.margin = '3px 3px -2px 3px';
        if (activated)
          button.appendChild(svg);
      }
    );
    this.subscription = this.activated$.subscribe(
      isActivated => {
        activated = isActivated;
        if (button.children.length > 0) button.removeChild(button.children.item(0)!);
        if (activated && svgOff) button.appendChild(svgOff);
        else if (!activated && svgOn) button.appendChild(svgOn);
      }
    );
    button.onclick = async (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      map.fireEvent('toggleBubbles');
    };
    return button;
  }

  override onRemove(map: L.Map): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }
}