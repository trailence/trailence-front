import { firstValueFrom } from 'rxjs';
import { PdfContext } from './pdf-context';

export async function addIconToPdf(ctx: PdfContext, name: string, color: string, x: number, y: number, width: number, height: number) {
  const icon = await firstValueFrom(ctx.assets.getIcon(name, true));
  applySvgStyle(icon, false);
  addSvgToPdf(ctx, icon.outerHTML.replaceAll('currentColor', color), x, y, width, height);
}

export async function addSvgToPdf(ctx: PdfContext, svg: string, x: number, y: number, width: number, height: number) {
  (globalThis as any).SVGtoPDF(ctx.doc, svg, x, y, {width, height, preserveAspectRatio: 'xMinYMin'});
}

function applySvgStyle(element: Element, isIonIcon: boolean) {
  if (isIonIcon) {
    if (element.classList.contains('ionicon-fill-none')) {
      if (!element.attributes.getNamedItem('fill')) {
        const a = document.createAttribute('fill');
        a.value = 'none';
        element.attributes.setNamedItem(a);
      }
    }
    if (element.classList.contains('ionicon-stroke-width')) {
      if (!element.attributes.getNamedItem('stroke-width')) {
        const a = document.createAttribute('stroke-width');
        a.value = '32px';
        element.attributes.setNamedItem(a);
      }
    }
  }
  if (element.classList.contains('ionicon')) {
    if (!element.attributes.getNamedItem('stroke')) {
      const a = document.createAttribute('stroke');
      a.value = 'currentColor';
      element.attributes.setNamedItem(a);
    }
    if (!element.attributes.getNamedItem('fill')) {
      const a = document.createAttribute('fill');
      a.value = 'currentColor';
      element.attributes.setNamedItem(a);
    }
    isIonIcon = true;
  }
  if (isIonIcon) {
    for (let i = 0; i < element.children.length; ++i) {
      applySvgStyle(element.children.item(i)!, true);
    }
  }
}
