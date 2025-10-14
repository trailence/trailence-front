import { Point2D } from './geometry-utils';

export class HtmlUtils {

  public static getPositionInPage(element: HTMLElement): Point2D {
    const pos = {x: element.offsetLeft, y: element.offsetTop};
    while (element.offsetParent && element.offsetParent !== element && element.offsetParent !== document.body) {
      element = element.offsetParent as HTMLElement;
      pos.x += element.offsetLeft;
      pos.y += element.offsetTop;
      pos.x -= element.scrollLeft;
      pos.y -= element.scrollTop;
    }
    return pos;
  }

}
