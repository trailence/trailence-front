import { PdfContext } from './pdf-context';

export async function addQrCodeToPdf(ctx: PdfContext, link: string, x: number, y: number, width: number): Promise<number> {
  const module = await import('qrcode');
  const canvas = document.createElement('CANVAS') as HTMLCanvasElement;
  canvas.width = width / ctx.layout.pixelRatio;
  canvas.height = width / ctx.layout.pixelRatio;
  const result = await new Promise<string>((resolve, reject) => {
    module.default.toDataURL(canvas, link,
      {
        type: 'image/png',
        margin: 0,
      },
      (e, r) => {
        if (!e && r) resolve(r);
        else reject(e);
      }
    );
  });
  ctx.doc.image(result, x, y, { width, height: width });
  ctx.doc.strokeColor('#5050FF').fillColor('#5050FF').font('Roboto', 12)
    .text(ctx.i18n.texts.pages.pdf_popup.qr_code_link, x, y + width + 2, {continued: false, width: width, link: link});
  return ctx.doc.y;
}
