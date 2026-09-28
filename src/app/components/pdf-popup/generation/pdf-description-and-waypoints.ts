import { defaultNextPage, HorizBounds, PdfContext } from './pdf-context';
import { pdfCalculateHeightSandbox } from './pdf-sandbox';
import { generatePdfText } from './pdf-text';
import { addTitleToPdf } from './pdf-title';
import { generateWaypointsTextToPdf } from './pdf-waypoints';

export function generateDescriptionAndWaypoints(ctx: PdfContext, hasWaypoints: boolean, y: number, horiz: HorizBounds): number { // NOSONAR
  if (!ctx.description && !hasWaypoints) return y;
  if (!hasWaypoints) {
    // only description
    const generate = function() {
      addTitleToPdf(ctx, 1, ctx.i18n.texts.metadata.description, horiz.x, y, horiz.width);
      generatePdfText(ctx, ctx.description!, ctx.doc.y, horiz, 11);
    };
    if (y + 40 > ctx.layout.height - ctx.layout.margin) {
      const size = pdfCalculateHeightSandbox(ctx, generate);
      if (size === null) horiz = horiz.nextPage(horiz);
    }
    generate();
    return ctx.doc.y;
  }
  if (!ctx.description) {
    // only waypoints
    const generateCurrentSettings = function(horiz: HorizBounds) {
      if (ctx.doc.y + 40 > ctx.layout.height - ctx.layout.margin) horiz = horiz.nextPage(horiz);
      addTitleToPdf(ctx, 1, ctx.i18n.texts.pages.trail.sections.waypoints.title, horiz.x, ctx.doc.y, horiz.width);
      generateWaypointsTextToPdf(ctx, ctx.doc.y, horiz);
    }
    if (horiz.width !== ctx.layout.width - ctx.layout.margin * 2) {
      // already in a column, let's just generate it
      generateCurrentSettings(horiz);
      return ctx.doc.y;
    }
    const sizeCurrentSettings = pdfCalculateHeightSandbox(ctx, () => generateCurrentSettings(horiz));
    if (sizeCurrentSettings != null) {
      // it fit => let's go
      generateCurrentSettings(horiz);
      return ctx.doc.y;
    }
    // full width => try if it can fit within 2 columns
    const generate2Columns = function() {
      if (ctx.doc.y + 40 > ctx.layout.height - ctx.layout.margin) ctx.doc.nextPage();
      addTitleToPdf(ctx, 1, ctx.i18n.texts.pages.trail.sections.waypoints.title, horiz.x, ctx.doc.y, ctx.layout.width - ctx.layout.margin * 2);
      let originalY = ctx.doc.y;
      let horiz2: HorizBounds = {x: horiz.x, width: (ctx.layout.width - ctx.layout.margin * 2) / 2 - 2.5, nextPage: current => {
        ctx.doc.y = originalY;
        return {x: current.x + current.width + 5, width: current.width, nextPage: defaultNextPage(ctx)};
      }};
      generateWaypointsTextToPdf(ctx, ctx.doc.y, horiz2);
    }
    const size2 = pdfCalculateHeightSandbox(ctx, generate2Columns);
    if (size2 != null) {
      // fit in 2 columns
      generate2Columns();
      return ctx.doc.y;
    }
    generateCurrentSettings(horiz);
    return ctx.doc.y;
  }
  // both
  const generateCurrentSettings = function(horiz: HorizBounds) {
    if (y + 40 > ctx.layout.height - ctx.layout.margin) horiz = horiz.nextPage(horiz);
    addTitleToPdf(ctx, 1, ctx.i18n.texts.metadata.description, horiz.x, y, horiz.width);
    const state = generatePdfText(ctx, ctx.description!, ctx.doc.y, horiz, 11);
    ctx.doc.y = state.y + 3;
    horiz = state.horiz;
    if (ctx.doc.y + 40 > ctx.layout.height - ctx.layout.margin) horiz = horiz.nextPage(horiz);
    addTitleToPdf(ctx, 1, ctx.i18n.texts.pages.trail.sections.waypoints.title, horiz.x, ctx.doc.y, horiz.width);
    generateWaypointsTextToPdf(ctx, ctx.doc.y, horiz);
  }
  if (horiz.width !== ctx.layout.width - ctx.layout.margin * 2) {
    // already in a column, let's just generate it
    generateCurrentSettings(horiz);
    return ctx.doc.y;
  }
  const sizeCurrentSettings = pdfCalculateHeightSandbox(ctx, () => generateCurrentSettings(horiz));
  if (sizeCurrentSettings !== null) {
    generateCurrentSettings(horiz);
    return ctx.doc.y;
  }
  // try side by side
  const generateSideBySide = function() {
    const h1: HorizBounds = {
      x: horiz.x,
      width: horiz.width / 2 - 2.5,
      nextPage: defaultNextPage(ctx)
    };
    addTitleToPdf(ctx, 1, ctx.i18n.texts.metadata.description, h1.x, y, h1.width);
    const state1 = generatePdfText(ctx, ctx.description!, ctx.doc.y, h1, 11);
    const h2: HorizBounds = {
      x: horiz.x + horiz.width / 2 + 2.5,
      width: horiz.width / 2 - 2.5,
      nextPage: defaultNextPage(ctx)
    };
    addTitleToPdf(ctx, 1, ctx.i18n.texts.pages.trail.sections.waypoints.title, h2.x, y, h2.width);
    const state2 = generateWaypointsTextToPdf(ctx, ctx.doc.y, h2);
    ctx.doc.y = Math.max(state1.y, state2.y);
    return Promise.resolve();
  }
  const sizeSideBySide = pdfCalculateHeightSandbox(ctx, generateSideBySide);
  if (sizeSideBySide !== null) {
    void generateSideBySide();
    return ctx.doc.y;
  }
  // try 2 columns continuous
  const generate2Columns = function() {
    let h: HorizBounds = {x: horiz.x, width: (ctx.layout.width - ctx.layout.margin * 2) / 2 - 2.5, nextPage: current => {
      ctx.doc.y = y;
      return {x: current.x + current.width + 5, width: current.width, nextPage: defaultNextPage(ctx)};
    }};
    addTitleToPdf(ctx, 1, ctx.i18n.texts.metadata.description, h.x, y, h.width);
    const state1 = generatePdfText(ctx, ctx.description!, ctx.doc.y, h, 11);
    ctx.doc.y = state1.y + 3;
    h = state1.horiz;
    if (ctx.doc.y + 40 > ctx.layout.height - ctx.layout.margin) h = h.nextPage(h);
    addTitleToPdf(ctx, 1, ctx.i18n.texts.pages.trail.sections.waypoints.title, h.x, ctx.doc.y, h.width);
    const state2 = generateWaypointsTextToPdf(ctx, ctx.doc.y, h);
    ctx.doc.y = state2.y;
  }
  const size2Columns = pdfCalculateHeightSandbox(ctx, generate2Columns);
  if (size2Columns !== null) {
    generate2Columns();
    return ctx.doc.y;
  }
  // else go current way
  generateCurrentSettings(horiz);
  return ctx.doc.y;
}
