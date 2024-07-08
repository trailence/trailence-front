import * as L from 'leaflet';
import { environment } from 'src/environments/environment';
import { MapToolUtils } from './map-tool-utils';

export const MapCenterOnPositionTool = L.Control.extend({

  onAdd: (map: L.Map) => {
    const img = L.DomUtil.create('img');
    img.src = environment.assetsUrl + '/center-on-location.1.svg';
    img.style.width = '26px';
    img.style.margin = '3px 3px -2px 3px';
    return MapToolUtils.createButtonWithEvent(map, img, 'centerOnLocation');
  },
  onRemove: (map: L.Map) => {}
});
