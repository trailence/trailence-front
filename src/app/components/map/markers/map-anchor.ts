import * as L from 'leaflet';

export class MapAnchor {

  public marker: L.Marker;
  public tooltipContent?: string;
  public saveState: any = {};

  constructor(
    public point: L.LatLngLiteral,
    public borderColor: string = '#000000',
    public text: string = '',
    public title?: string,
    public textColor?: string,
    public fillColor?: string,
    public fillColor2?: string,
    rotateOnMouseHover: boolean = true,
    public data: any = undefined,
  ) {
    this.marker = L.marker(point, {
      icon: L.icon({
        iconUrl: MapAnchor.createDataIcon(borderColor, text, textColor, fillColor, fillColor2),
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        className: 'anchor',
      }),
      title
    });
    if (rotateOnMouseHover) {
      let rotate = false;
      const mousemovelistener = (event: L.LeafletMouseEvent) => {
        const icon = (this.marker as any)._icon as HTMLImageElement;
        const pos = (icon as any)._leaflet_pos as L.Point;
        const mouseX = event.layerPoint.x - pos.x;
        const mouseY = event.layerPoint.y - pos.y;
        if (mouseX > -23 && mouseX < 23 && mouseY > -43 && mouseY < 3) {
          if (!rotate) {
            icon.style.transformOrigin = 'bottom center';
            const sign = mouseX < 0 ? '' : '-';
            icon.style.transform = 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0px) rotateZ(' + sign + '90deg)'
            rotate = true;
          }
        } else if (rotate) {
          icon.style.transform = 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0px)'
          rotate = false;
        }
      };
      this.marker.addEventListener('add', (event) => {
        const map = event.target._map as L.Map;
        map.addEventListener('mousemove', mousemovelistener);
      });
      this.marker.addEventListener('remove', (event) => {
        const map = event.target._map as L.Map;
        map.removeEventListener('mousemove', mousemovelistener);
      });
    }
  }

  public bindTooltip(content: string): this {
    this.tooltipContent = content;
    this.marker.bindTooltip(content);
    return this;
  }

  public static createDataIcon(
    borderColor: string = '#000000',
    text: string = '',
    textColor?: string,
    fillColor?: string,
    fillColor2?: string
  ): string {
    let svg = '<?xml version="1.0" encoding="utf-8"?>';
    svg += '<svg width="800px" height="800px" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg">';
    if (fillColor) {
      fillColor2 ??= fillColor;
      svg += '<path d="m957,1579.09c0,-3.33 6.67,-1516.67 5,-1516.67c-1.67,0 -571.67,40 -570,590c1.67,550 258.33,456.67 276.67,490c18.33,33.33 288.33,436.67 288.33,436.67z"';
      svg += ' fill="' + fillColor + '" stroke="' + fillColor + '"/>';
      svg += '<path d="m958,1572.42c0,0 3.33,-1510 1.67,-1510c-1.67,0 578.33,76.67 550,586.67c-28.33,510 -271.67,550 -273.33,550c-1.67,0 -278.33,373.33 -278.33,373.33z"';
      svg += ' fill="' + fillColor2 + '" stroke="' + fillColor2 + '"/>';
    }
    svg += '<path d="M1290 1083.396c-114.12 113.16-253.68 269.88-332.04 466.8-76.92-199.08-215.16-354.84-327.96-466.92-141.36-140.04-210-279.48-210-426.48 0-295.92 240.84-536.76 543.12-536.76 296.04 0 536.88 240.84 536.88 536.76 0 147-68.64 286.44-210 426.6M956.88.036C594.72.036 300 294.636 300 656.796c0 180.6 80.28 348 245.4 511.68 239.76 237.84 351.48 457.56 351.48 691.56v60h120v-60c0-232.92 110.4-446.16 357.72-691.44 165.12-163.8 245.4-331.2 245.4-511.8C1620 294.636 1325.28.036 956.88.036" fill-rule="evenodd"';
    svg += ' fill="' + borderColor + '" class="anchor-border"'
    svg += '/>';
    textColor ??= borderColor;
    svg += '<text x="960" y="700" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="600px" font-weight="bold" fill="' + textColor + '" stroke="' + textColor + '">' +text + '</text>';
    svg += '</svg>';
    return 'data:image/svg+xml;base64,' + btoa(svg);
  }

}
