import { PdfContext } from './pdf-context';
import { addIconToPdf } from './pdf-icon';

export async function generatePdfHeader(ctx: PdfContext) {
  let avatarMargin = 0;
  let avatarSize = 0;
  let avatarX = ctx.layout.width - ctx.layout.margin;
  let titleMaxWidth = ctx.layout.width - ctx.layout.margin * 2;
  if (ctx.avatar) {
    if (ctx.avatarSize === 'large') {
      avatarMargin = -(ctx.layout.margin / 2);
      avatarSize = ctx.layout.headerHeight * 1.5 - ctx.layout.margin - avatarMargin
    } else {
      avatarMargin = -5;
      avatarSize = ctx.layout.headerHeight - ctx.layout.margin - avatarMargin;
    }
    avatarX = ctx.layout.width - ctx.layout.margin - avatarSize - avatarMargin;
    titleMaxWidth = avatarX - 3 - ctx.layout.margin;
  }

  const title = 'Trailence - ' + ctx.trailName;
  ctx.doc.font('Roboto');
  let size = 18;
  while (size >= 10) {
    ctx.doc.fontSize(size);
    const width = ctx.doc.widthOfString(title, 0, 0);
    if (width <= titleMaxWidth - size * 1.5) break;
    size--;
  }

  ctx.doc.fillColor('#00a000')
    .rect(0, 0, ctx.doc.page.width, ctx.layout.headerHeight)
    .fill();
  const iconSize = size * 1.333333;
  await addIconToPdf(ctx, 'logo', '#ffffff', ctx.layout.margin, ctx.layout.margin - 1, iconSize, iconSize);
  ctx.doc.strokeColor('#ffffff').fillColor('#ffffff').fontSize(size)
    .text(title, ctx.layout.margin + size * 1.5, ctx.layout.margin, {width: titleMaxWidth - size * 1.5});
  if (ctx.avatar) {
    ctx.doc.image(ctx.avatar, avatarX, ctx.layout.margin + avatarMargin, { width: avatarSize, height: avatarSize });
  }
}
