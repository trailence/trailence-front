import { PdfContext } from './pdf-context';

export async function pdfCalculateHeightSandbox(ctx: PdfContext, generator: () => Promise<any>): Promise<number | null> {
  const startY = ctx.doc.y;
  const doc = ctx.doc;
  const sandbox = ctx.sandbox();
  ctx.doc = sandbox;
  ctx.doc.y = startY;
  await generator();
  const endPage = ctx.doc.bufferedPageRange().count;
  const endY = ctx.doc.y;
  ctx.doc = doc;
  return endPage > 1 ? null : (endY - startY);
}
