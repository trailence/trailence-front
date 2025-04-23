import L from 'leaflet';
import { MapToolUtils } from './map-tool-utils';
import { Observable, Subscription } from 'rxjs';
import { Injector } from '@angular/core';
import { AssetsService } from 'src/app/services/assets/assets.service';

export class MapBubblesTool extends L.Control {

  constructor(
    private readonly injector: Injector,
    private readonly activated$: Observable<boolean>,
    options?: L.ControlOptions,
  ) {
    super(options);
  }

  private subscription?: Subscription;

  override onAdd(map: L.Map) {
    const button = MapToolUtils.createButton('bubbles-tool');
    button.style.color = 'black';
    const assets = this.injector.get(AssetsService);
    let svgOn: SVGSVGElement, svgOff: SVGSVGElement;
    let activated = false;
    assets.loadSvg(assets.icons['bubbles']).subscribe(
      svg => {
        svgOn = svg;
        if (!activated)
          button.appendChild(svg);
      }
    );
    assets.loadSvg(assets.icons['path']).subscribe(
      svg => {
        svgOff = svg;
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
