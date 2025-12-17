import { PdfContext } from './pdf-context';
import { addIconToPdf } from './pdf-icon';
import { replaceSpaces } from './pdf-text';

export async function metaToPdf(ctx: PdfContext, x: number, y: number, w: number) {
  ctx.doc.font('Roboto');
  const verticalSpacing = 5;
  if (ctx.trail.location.length > 0) {
    await metaRowToPdf(ctx, 'location', ctx.i18n.texts.metadata.trail_location, ctx.trail.location, x, y, w);
    y = ctx.doc.y + verticalSpacing;
  }
  let secondTile = false;
  if (ctx.track.metadata.duration) {
    await metaRowToPdf(ctx, 'duration', ctx.i18n.texts.metadata.duration, ctx.i18n.durationToString(ctx.track.metadata.duration), x, y, w / 2);
    const breaksDuration = ctx.track.computedMetadata.breakDurationSnapshot();
    if (breaksDuration) {
      await metaRowToPdf(ctx, 'hourglass', ctx.i18n.texts.metadata.breaksDuration, ctx.i18n.durationToString(breaksDuration), x + w / 2, y, w / 2);
      y = ctx.doc.y + verticalSpacing;
    } else {
      secondTile = true;
    }
  }
  const estimatedDuration = ctx.track.computedMetadata.estimatedDurationSnapshot();
  if (estimatedDuration) {
    await metaRowToPdf(ctx, 'chrono', ctx.i18n.texts.metadata.estimatedDuration, '≈ ' + ctx.i18n.durationToString(estimatedDuration), x + (secondTile ? w / 2 : 0), y, w / 2);
    if (secondTile) {
      secondTile = false;
      y = ctx.doc.y + verticalSpacing;
    } else {
      secondTile = true;
    }
  }
  await metaRowToPdf(ctx, 'distance', ctx.i18n.texts.metadata.distance, ctx.i18n.distanceToString(ctx.track.metadata.distance), x + (secondTile ? w / 2 : 0), y, w / 2);
  y = ctx.doc.y + verticalSpacing;
  if (ctx.track.metadata.positiveElevation !== undefined) {
    await metaRowToPdf(ctx, 'positive-elevation', ctx.i18n.texts.metadata.positiveElevation, '+ ' + ctx.i18n.elevationToString(ctx.track.metadata.positiveElevation), x, y, w / 2);
    await metaRowToPdf(ctx, 'negative-elevation', ctx.i18n.texts.metadata.negativeElevation, '- ' + ctx.i18n.elevationToString(ctx.track.metadata.negativeElevation), x + w / 2, y, w / 2);
    y = ctx.doc.y + verticalSpacing;
  }
  if (ctx.track.metadata.highestAltitude !== undefined) {
    await metaRowToPdf(ctx, 'highest-point', ctx.i18n.texts.metadata.highestAltitude, ctx.i18n.elevationToString(ctx.track.metadata.highestAltitude), x, y, w / 2);
    await metaRowToPdf(ctx, 'lowest-point', ctx.i18n.texts.metadata.lowestAltitude, ctx.i18n.elevationToString(ctx.track.metadata.lowestAltitude), x + w / 2, y, w / 2);
    y = ctx.doc.y + verticalSpacing;
  }
  return y;
}

export async function metaRowToPdf(ctx: PdfContext, icon: string, title: string, value: string, x: number, y: number, w: number) {
  const large = w >= 100;
  const iconSize = large ? 24 : 14;
  const iconHMargin = large ? 2 : 2;
  const iconVMargin = large ? 0 : 2;

  ctx.doc.strokeColor('#A07040').fillColor('#A07040').fontSize(large ? 9 : 8);
  ctx.doc.text(title, x + (large ? iconSize + iconHMargin : 0), y, {continued: false, width: w - (large ? iconSize - iconHMargin : 0)});

  const iconY = large ? y : ctx.doc.y;
  await addIconToPdf(ctx, icon, '#A07040', x, large ? y + iconVMargin : ctx.doc.y, iconSize, iconSize);

  ctx.doc.strokeColor('#000000').fillColor('#000000').fontSize(large ? 11 : 10);
  ctx.doc.text(replaceSpaces(value), x + iconSize + iconHMargin, ctx.doc.y + (large ? 0 : 2), {continued: false, width: w - iconSize - iconHMargin});

  if (ctx.doc.y < iconY + iconSize) ctx.doc.y = iconY + iconSize;
}
/*
export async function metaTileToPdf(ctx: PdfContext, icon: string, title: string, value: string, x: number, y: number, w: number) {
  const iconSize = 18;
  ctx.doc.fontSize(9).strokeColor('#A07040').fillColor('#A07040');
  ctx.doc.text(title, x, y, {continued: false, width: w, align: 'center'});
  await addIconToPdf(ctx, icon, '#A07040', x + w / 2 - iconSize / 2, ctx.doc.y - 1, iconSize, iconSize);
  ctx.doc.y += iconSize;
  ctx.doc.fontSize(10).strokeColor('#000000').fillColor('#000000');
  ctx.doc.text(replaceSpaces(value), x, ctx.doc.y, {continued: false, width: w, align: 'center'});
}
*/
