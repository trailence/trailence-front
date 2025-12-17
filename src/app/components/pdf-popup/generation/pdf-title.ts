import { PdfContext } from './pdf-context';

export async function addTitleToPdf(ctx: PdfContext, level: number, text: string, x: number, y: number, width: number) {
  ctx.doc.strokeColor('#3088D8').fillColor('#3088D8').font('Roboto', 12);
  const textWidth = ctx.doc.widthOfString(text);
  ctx.doc.text(text, x + 20, y, {width: width - 40, continued: true});
  ctx.doc.text('\n', {continued: false});
  const endText = x + 20 + textWidth;
  const textSpacing = 5;
  const lineY = 7;
  ctx.doc.moveTo(x, y + lineY).lineTo(x + 15, y + lineY).stroke();
  const gradient = ctx.doc.linearGradient(endText + textSpacing, y + lineY, x + width, y + lineY);
  gradient.stop(0, '#3088D8').stop(0.15, '#3088D8').stop(1, '#ffffff');
  ctx.doc.moveTo(endText + textSpacing, y + lineY).lineTo(x + width, y + lineY).stroke(gradient);
}
