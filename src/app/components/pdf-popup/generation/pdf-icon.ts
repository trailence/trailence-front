import { firstValueFrom } from 'rxjs';
import { PdfContext } from './pdf-context';

export async function addIconToPdf(ctx: PdfContext, name: string, color: string, x: number, y: number, width: number, height: number) {
  const icon = await firstValueFrom(ctx.assets.getIcon(name, true));
  applySvgStyle(icon, false);
  addSvgToPdf(ctx, icon.outerHTML.replaceAll('currentColor', color), x, y, width, height);
}

export function addSvgToPdf(ctx: PdfContext, svg: string, x: number, y: number, width: number, height: number) {
  (globalThis as any).SVGtoPDF(ctx.doc, svg, x, y, {width, height, preserveAspectRatio: 'xMinYMin'});
}

function applySvgStyle(element: Element, isIonIcon: boolean) {
  if (isIonIcon) {
    if (element.classList.contains('ionicon-fill-none')) {
      defaultAttribute(element, 'fill', 'none');
    }
    if (element.classList.contains('ionicon-stroke-width')) {
      defaultAttribute(element, 'stroke-width', '32px');
    }
  }
  if (element.classList.contains('ionicon')) {
    defaultAttribute(element, 'stroke', 'currentColor');
    defaultAttribute(element, 'fill', 'currentColor');
    isIonIcon = true;
  }
  if (isIonIcon) {
    for (let i = 0; i < element.children.length; ++i) {
      applySvgStyle(element.children.item(i)!, true);
    }
  }
}

function defaultAttribute(element: Element, attributeName: string, value: string): void {
  if (element.attributes.getNamedItem(attributeName)) return;
  const a = document.createAttribute(attributeName);
  a.value = value;
  element.attributes.setNamedItem(a);
}
