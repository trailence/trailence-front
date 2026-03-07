import { ApplicationRef, createComponent, inputBinding } from '@angular/core';
import { PdfContext } from './pdf-context';

export async function generateElevationGraphToPdf(ctx: PdfContext, x: number, y: number, w: number, h: number) {
  const host = document.createElement('DIV');
  host.style.position = 'fixed';
  host.style.left = '0px';
  host.style.width = (w * ctx.layout.pixelRatio) + 'px';
  host.style.height = (h * ctx.layout.pixelRatio) + 'px';
  host.style.top = '-' + (h * ctx.layout.pixelRatio) + 'px';
  host.classList.add('light-theme');
  document.body.appendChild(host);
  const graphModule = await import('../../trail-graph/trail-graph.component');
  const graphRef = createComponent(graphModule.TrailGraphComponent, {
    environmentInjector: ctx.environmentInjector,
    hostElement: host,
    bindings: [
      inputBinding('track1', () => ctx.track),
      inputBinding('graphType', () => 'elevation'),
      inputBinding('waitVisibleBeforeToRender', () => false),
      inputBinding('enableVisualEffects', () => false),
    ]
  });
  ctx.injector.get(ApplicationRef).attachView(graphRef.hostView);
  graphRef.instance.setVisible(true);
  const canvas = await waitForGraph(host);
  const image = canvas.toDataURL('image/png');
  ctx.doc.image(image, x, y, {width: w, height: h});
  ctx.injector.get(ApplicationRef).detachView(graphRef.hostView);
  graphRef.destroy();
  host.remove();
}

async function waitForGraph(host: HTMLElement) {
  const wait = (resolve: (value: HTMLCanvasElement) => void) => {
    const canvas = host.querySelector('div.graph-container > canvas');
    if (canvas && (canvas as HTMLCanvasElement).style.display === 'block') {
      resolve(canvas as HTMLCanvasElement);
      return;
    }
    setTimeout(() => wait(resolve), 10);
  };
  return new Promise<HTMLCanvasElement>(resolve => {
    wait(resolve);
  });
}
