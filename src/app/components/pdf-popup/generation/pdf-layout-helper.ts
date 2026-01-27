import { PdfContext } from './pdf-context';
import { PdfOptions } from './pdf-generator';

export type PdfSectionGenerator = (ctx: PdfContext, options: PdfOptions, x: number, y: number, width: number) => Promise<number>;

export class PdfFixedColumnsLayout {

  constructor(
    x: number,
    y: number,
    colSizes: {width: number, gap: number}[],
    private readonly ctx: PdfContext,
    private readonly options: PdfOptions,
  ) {
    let colX = x;
    this.colState = [];
    for (let i = 0; i < colSizes.length; ++i) {
      this.colState.push({
        x: colX,
        y: y,
        width: colSizes[i].width,
        nextMargin: 0,
      });
      colX += colSizes[i].width + colSizes[i].gap;
    }
  }

  private colState: {
    x: number,
    y: number,
    width: number,
    nextMargin: number,
  }[];

  public async generate(colIndex: number, generator: PdfSectionGenerator, marginBottom: number) {
    const state = this.colState[colIndex];
    state.y = await generator(this.ctx, this.options, state.x, state.y + state.nextMargin, state.width);
    state.nextMargin = marginBottom;
  }

  public getColumnHeight(colIndex: number): number {
    return this.colState[colIndex].y;
  }

  public close(ctx: PdfContext): void {
    let y = this.colState[0].y;
    for (let i = 1; i < this.colState.length; ++i)
        y = Math.max(y, this.colState[i].y);
    ctx.doc.y = y;
  }

}

export async function pdfFullWidth(section: PdfSectionGenerator, ctx: PdfContext, options: PdfOptions, marginBottom: number = 0) {
  const y = ctx.doc.y;
  const h = await section(ctx, options, ctx.layout.margin, y, ctx.layout.width - ctx.layout.margin * 2);
  ctx.doc.y = y + h + marginBottom;
}
