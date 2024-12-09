import L from 'leaflet';
import { environment } from 'src/environments/environment';
import { MapToolUtils } from './map-tool-utils';

export const MapFitBoundsTool = L.Control.extend({

  onAdd: (map: L.Map) => {
    const img = L.DomUtil.create('img');
    img.src = environment.assetsUrl + '/zoom-fit.1.svg';
    img.style.width = '32px';
    img.style.marginBottom = '-4px';
    return MapToolUtils.createButtonWithEvent(map, img, 'fitBounds', 'fit-bounds-tool');
  },
  onRemove: (map: L.Map) => {}
});
