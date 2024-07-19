import * as L from 'leaflet';

export class ZoomLevelDisplayTool extends L.Control {

  override onAdd(map: L.Map): HTMLElement {
    const span = document.createElement('SPAN');
    span.style.backgroundColor = 'rgba(255,255,255,0.5)';
    span.style.color = '#202020';
    span.style.padding = '1px 2px';
    span.innerText = 'Zoom: ' + map.getZoom().toLocaleString('en', {maximumFractionDigits: 1});
    map.on('zoom', () => {
      span.innerText = 'Zoom: ' + map.getZoom().toLocaleString('en', {maximumFractionDigits: 1});
    });
    return span;
  }

}
