import L from 'leaflet';

export class MapToolUtils {

  public static createButton(className: string): HTMLDivElement {
    const button = document.createElement('div');
    button.className = 'leaflet-control-button ' + className;
    return button;
  }

  public static createButtonWithEvent(map: L.Map, icon: HTMLImageElement, eventName: string, className: string): HTMLDivElement {
    const button = document.createElement('div');
    button.className = 'leaflet-control-button ' + className;
    button.appendChild(icon);

    button.onclick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      map.fireEvent(eventName);
    };

    return button;
  }

}
