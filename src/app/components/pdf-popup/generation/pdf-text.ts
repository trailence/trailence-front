import { TextComponent } from '../../text/text.component';
import { HorizBounds, PdfContext } from './pdf-context';

export async function generatePdfText(ctx: PdfContext, text: string, y: number, horiz: HorizBounds, fontSize: number) {
  text = TextComponent.replaceBreakLines(text);
  const div = document.createElement('DIV');
  div.innerHTML = text;
  ctx.doc.strokeColor('#000000').fillColor('#000000').font('Roboto', fontSize);
  ctx.doc.text('', horiz.x, y, {continued: true, width: horiz.width});
  const options = {
    italic: false,
    bold: false,
    horiz,
    fontSize,
    firstText: true,
  };
  htmlToPdf(ctx, div, options);
  newLine(ctx, options);
  return {y: ctx.doc.y, horiz: options.horiz};
}

interface TextOptions {
  italic: boolean;
  bold: boolean;
  horiz: HorizBounds;
  fontSize: number;
  firstText: boolean;
}

async function htmlToPdf(ctx: PdfContext, html: HTMLElement, options: TextOptions) {
  switch (html.tagName) {
    case 'EM': {
      const o = {...options, italic: true};
      htmlContentToPdf(ctx, html, o);
      options.horiz = o.horiz;
      options.firstText = o.firstText;
      break;
    }
    case 'STRONG': {
      const o = {...options, bold: true};
      htmlContentToPdf(ctx, html, o);
      options.horiz = o.horiz;
      options.firstText = o.firstText;
      break;
    }
    case 'BR':
      if (!options.firstText)
        newLine(ctx, options);
      break;
    case 'P':
      if (!options.firstText) {
        newLine(ctx, options);
      }
      htmlContentToPdf(ctx, html, options);
      if (!options.firstText) {
        newLine(ctx, options);
      }
      break;
    case 'UL': renderBulletList(ctx, html, false, options); break;
    case 'OL': renderBulletList(ctx, html, true, options); break;
    default: htmlContentToPdf(ctx, html, options);
  }
}

function htmlContentToPdf(ctx: PdfContext, html: HTMLElement, options: TextOptions) {
  for (let i = 0; i < html.childNodes.length; ++i) {
    const child = html.childNodes.item(i);
    switch (child.nodeType) {
      case child.TEXT_NODE:
        drawText(ctx, options, child.nodeValue ?? '');
        break;
      case child.ELEMENT_NODE:
        htmlToPdf(ctx, child as HTMLElement, options);
        break;
    }
  }
}

function drawText(ctx: PdfContext, options: TextOptions, text: string) {
  text = text.replaceAll('\n', '').trim();
  if (text.length === 0) return;
  ctx.doc.font(options.bold ? 'Roboto-Bold' : 'Roboto');
  const textOptions = {
    continued: true,
    oblique: options.italic,
    width: options.horiz.width,
  };
  let currentText = text;
  let remainingText = '';
  let x = ctx.doc.x;
  let y = ctx.doc.y;
  do {
    const height = ctx.doc.boundsOfString(currentText, x, 0, {...textOptions, continued: false}).height;
    if (y + height <= ctx.layout.height - ctx.layout.margin) break;
    let i = currentText.lastIndexOf(' ');
    remainingText = currentText.substring(i).trim() + (remainingText.length > 0 ? ' ' + remainingText : '');
    currentText = currentText.substring(0, i).trim();
  } while (currentText.length > 0);
  const pageBefore = ctx.doc.bufferedPageRange().count;;
  if (currentText.length > 0) {
    options.firstText = false;
    ctx.doc.text(currentText, x, y, textOptions);
  }
  if (remainingText.length > 0) {
    ctx.doc.text('', {continued: false});
  }
  const pageAfter = ctx.doc.bufferedPageRange().count;
  if (remainingText.length > 0) {
    if (pageAfter !== pageBefore)
      ctx.doc.switchToPage(ctx.doc.bufferedPageRange().count - 2);
    options.horiz = options.horiz.nextPage(options.horiz);
    ctx.doc.x = options.horiz.x;
    drawText(ctx, options, remainingText);
  } else if (pageAfter !== pageBefore) {
    ctx.doc.switchToPage(ctx.doc.bufferedPageRange().count - 2);
    options.horiz = options.horiz.nextPage(options.horiz);
    ctx.doc.x = options.horiz.x;
  }
}

function text(ctx: PdfContext, options: TextOptions, op: () => any) {
  const startPage = ctx.doc.bufferedPageRange().count;
  op();
  const endPage = ctx.doc.bufferedPageRange().count;
  if (endPage !== startPage) {
    ctx.doc.switchToPage(ctx.doc.bufferedPageRange().count - 2);
    options.horiz = options.horiz.nextPage(options.horiz);
    ctx.doc.x = options.horiz.x;
  }
}

function newLine(ctx: PdfContext, options: TextOptions) {
  text(ctx, options, () => {
    ctx.doc.text('\n', {continued: false, width: options.horiz.width});
    options.firstText = false;
  });
}

export function replaceSpaces(text: string): string {
  return text.replaceAll(String.fromCodePoint(160), ' ').replaceAll(String.fromCodePoint(0x202F), ' ');
}

function renderBulletList(ctx: PdfContext, ul: HTMLElement, numbered: boolean, options: TextOptions) {
  const padding = 10;
  const opts = {...options, horiz: { x: options.horiz.x + padding, width: options.horiz.width - padding, nextPage: options.horiz.nextPage}};
  for (let i = 0; i < ul.children.length; ++i) {
    const li = ul.children.item(i)!;
    if (li.tagName !== 'LI') continue;
    newLine(ctx, opts);
    if (numbered) {
      ctx.doc.text('' + (i + 1) + '. ', options.horiz.x, ctx.doc.y, {continued: true, width: options.horiz.width});
      const x = Math.max(ctx.doc.x, options.horiz.x + padding);
      opts.horiz.x = x;
      opts.horiz.width = options.horiz.width - (x - options.horiz.x);
    } else {
      ctx.doc.text('', opts.horiz.x, ctx.doc.y, {continued: true, width: opts.horiz.width});
      ctx.doc.circle(options.horiz.x + 4, ctx.doc.y + 7, 2, 2).fill();
    }
    const before = {...opts.horiz};
    htmlToPdf(ctx, li as HTMLElement, opts);
    options.horiz.x = options.horiz.x + (opts.horiz.x - before.x);
    options.horiz.width = options.horiz.width + (opts.horiz.width - before.width);
    options.horiz.nextPage = opts.horiz.nextPage;
  }
  newLine(ctx, options);
  ctx.doc.text('', options.horiz.x, ctx.doc.y, {continued: true, width: options.horiz.width});
}
