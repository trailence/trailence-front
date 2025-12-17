import { PdfContext } from './pdf-context';
import { addIconToPdf } from './pdf-icon';

export async function generatePdfHeader(ctx: PdfContext) {
  const title = 'Trailence - ' + ctx.trail.name;
  ctx.doc.font('Roboto');
  let size = 18;
  while (size >= 10) {
    ctx.doc.fontSize(size);
    const width = ctx.doc.widthOfString(title, 0, 0);
    if (width <= ctx.layout.width - ctx.layout.margin * 2 - size * 1.5) break;
    size--;
  }

  ctx.doc.fillColor('#00a000')
    .rect(0, 0, ctx.doc.page.width, ctx.layout.headerHeight)
    .fill();
  const iconSize = size * 1.333333;
  await addIconToPdf(ctx, 'logo', '#ffffff', ctx.layout.margin, ctx.layout.margin - 1, iconSize, iconSize);
  ctx.doc.strokeColor('#ffffff').fillColor('#ffffff').fontSize(size)
    .text(title, ctx.layout.margin + size * 1.5, ctx.layout.margin);
}
