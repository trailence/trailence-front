import { PdfContext } from './pdf-context';

export async function addQrCodeToPdf(ctx: PdfContext, link: string, x: number, y: number, width: number, qrCodeSize: number): Promise<number> {
  const module = await import('qrcode');
  const canvas = document.createElement('CANVAS') as HTMLCanvasElement;
  canvas.width = qrCodeSize / ctx.layout.pixelRatio;
  canvas.height = qrCodeSize / ctx.layout.pixelRatio;
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
  ctx.doc.image(result, x, y, { width: qrCodeSize, height: qrCodeSize });
  ctx.doc.strokeColor('#5050FF').fillColor('#5050FF').font('Roboto', 12);
  if (width - qrCodeSize > 40) {
    // on right side
    if (width - qrCodeSize < 70) ctx.doc.fontSize(10);
    ctx.doc.text(ctx.i18n.texts.pages.pdf_popup.qr_code_link, x + qrCodeSize + 2, y, {continued: false, width: width - qrCodeSize - 2, link: link});
    return Math.max(ctx.doc.y, y + qrCodeSize);
  } else {
    // below
    ctx.doc.text(ctx.i18n.texts.pages.pdf_popup.qr_code_link, x, y + qrCodeSize + 2, {continued: false, width: width, link: link});
    return ctx.doc.y;
  }
}
