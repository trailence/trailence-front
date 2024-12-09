import L from 'leaflet';

export class MapToolUtils {

  public static createButton(className: string): HTMLDivElement {
    const button = document.createElement('div');
    button.className = className;
    button.style.border = '2px solid rgba(0, 0, 0, 0.2)';
    button.style.background = '#ffffff';
    button.style.backgroundClip = 'padding-box';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    button.onmouseenter = () => button.style.borderColor = 'rgba(0, 0, 0, 0.5)';
    button.onmouseleave = () => button.style.borderColor = 'rgba(0, 0, 0, 0.2)';
    return button;
  }

  public static createButtonWithEvent(map: L.Map, icon: HTMLImageElement, eventName: string, className: string): HTMLDivElement {
    const button = document.createElement('div');
    button.className = className;
    button.style.border = '2px solid rgba(0, 0, 0, 0.2)';
    button.style.background = '#ffffff';
    button.style.backgroundClip = 'padding-box';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    button.onmouseenter = () => button.style.borderColor = 'rgba(0, 0, 0, 0.5)';
    button.onmouseleave = () => button.style.borderColor = 'rgba(0, 0, 0, 0.2)';
    button.appendChild(icon);

    button.onclick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      map.fireEvent(eventName);
    };

    return button;
  }

}
