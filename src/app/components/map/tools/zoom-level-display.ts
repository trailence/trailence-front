import * as L from 'leaflet';

export class ZoomLevelDisplayTool extends L.Control {

  override onAdd(map: L.Map): HTMLElement {
    const span = document.createElement('SPAN');
    span.style.backgroundColor = 'rgba(255,255,255,0.5)';
    span.style.color = '#202020';
    span.style.padding = '1px 2px';
    const text1 = document.createElement('SPAN');
    const text2 = document.createElement('SPAN');
    text1.innerText = 'Zoom: ';
    text2.innerText = map.getZoom().toLocaleString('en', {maximumFractionDigits: 1});
    span.appendChild(text1);
    span.appendChild(text2);
    text1.style.fontSize = '10px';
    text2.style.fontSize = '11px';
    map.on('zoom', () => {
      text2.innerText = map.getZoom().toLocaleString('en', {maximumFractionDigits: 1});
    });
    return span;
  }

}
