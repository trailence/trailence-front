import * as L from 'leaflet';
import { environment } from 'src/environments/environment';

export const MapFitBoundsTool = L.Control.extend({

  onAdd: (map: L.Map) => {
    const img = L.DomUtil.create('img');
    img.src = environment.assetsUrl + '/zoom-fit.1.svg';
    img.style.width = '32px';
    img.style.marginBottom = '-4px';
    const button = document.createElement('div');
    button.style.border = '2px solid rgba(0, 0, 0, 0.2)';
    button.style.background = '#ffffff';
    button.style.backgroundClip = 'padding-box';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    button.onmouseenter = () => button.style.borderColor = 'rgba(0, 0, 0, 0.5)';
    button.onmouseleave = () => button.style.borderColor = 'rgba(0, 0, 0, 0.2)';
    button.appendChild(img);
    button.onclick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      map.fireEvent('fitTrackBounds');
    };
    return button;
  },
  onRemove: (map: L.Map) => {}
});
