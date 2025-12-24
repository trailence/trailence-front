import { EnvironmentInjector, Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Trail } from 'src/app/model/trail';
import { AssetsService } from 'src/app/services/assets/assets.service';
import { TrackService } from 'src/app/services/database/track.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { environment } from 'src/environments/environment';
import { HorizBounds, PdfContext } from './pdf-context';
import { generatePdfHeader } from './pdf-header';
import { generatePdfMap } from './pdf-map';
import { generatePdfText } from './pdf-text';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { metaToPdf } from './pdf-meta';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { addTitleToPdf } from './pdf-title';
import { ComputedWayPoint, Track } from 'src/app/model/track';
import { generateWaypointsTextToPdf } from './pdf-waypoints';
import { generateElevationGraphToPdf } from './pdf-elevation-graph';
import { addQrCodeToPdf } from './pdf-qrcode';
import { hasWaypointsContent } from '../waypoints-utils';
import { MapLayer } from 'src/app/services/map/map-layers.service';

export enum PdfModel {
  BIG_MAP = 'BIG_MAP',
  ONE_PAGE = 'ONE_PAGE',
}

export interface PdfOptions {
  model: PdfModel;
  includeDescription: boolean;
  includeWaypoints: boolean;
  includeElevation: boolean;
  qrCode?: string;
  mapLayer: MapLayer;
}

export class PdfGenerator {

  public static generate(injector: Injector, environmentInjector: EnvironmentInjector, trail: Trail, track: Track | undefined, wayPoints: ComputedWayPoint[], options: PdfOptions, progress: (percent: number) => void): Promise<Blob> {
    return new Promise<Blob>(async (resolve) => {
      let percent = 0;
      let percentDone = (done: number) => { percent = Math.min(75, percent + done); progress(percent); };
      let roboto: ArrayBuffer;
      let robotoBold: ArrayBuffer;
      await Promise.all([
        PdfGenerator.loadJs('blob-stream.js').then(() => percentDone(2)),
        PdfGenerator.loadJs('pdfkit.standalone.js').then(() => percentDone(2)),
        PdfGenerator.loadJs('svg-to-pdfkit.js').then(() => percentDone(2)),
        globalThis.fetch(environment.assetsUrl + '/Roboto-Regular.ttf').then(r => r.arrayBuffer()).then(b => {roboto = b; percentDone(2);}),
        globalThis.fetch(environment.assetsUrl + '/Roboto-Bold.ttf').then(r => r.arrayBuffer()).then(b => {robotoBold = b; percentDone(2);}),
      ]);
      const opts = {
        size: 'A4',
        margins: { top: 60, bottom: 20, left: 20, right: 20},
        displayTitle: true,
        info: { Title: trail.name },
        bufferPages: true
      };
      const preferences = injector.get(PreferencesService);
      if (!track) {
        track = await firstValueFrom(injector.get(TrackService).getFullTrack$(trail.currentTrackUuid, trail.owner).pipe(filterDefined()));
        wayPoints = ComputedWayPoint.compute(track, preferences.preferences);
      } else if (wayPoints.length === 0) {
        wayPoints = ComputedWayPoint.compute(track, preferences.preferences);
      }
      percentDone(2);
      let docCounter = 0;
      const resetDoc = () => {
        const count = ++docCounter;
        const doc = new (window as any).PDFDocument(opts);
        doc.registerFont('Roboto', roboto);
        doc.registerFont('Roboto-Bold', robotoBold);
        const stream = doc.pipe((window as any).blobStream());
        stream.on('finish', function() {
          if (count !== docCounter) return;
          percentDone(2);
          const blob = stream.toBlob('application/pdf');
          resolve(blob);
        });
        return doc;
      };
      const ctx = {
        doc: resetDoc(),
        reset() {
          const previous = this.doc;
          this.doc = resetDoc();
          previous.end();
        },
        nextPage() {
          if (this.doc.page !== this.doc._pageBuffer.at(-1)) {
            this.doc.switchToPage(this.doc._pageBuffer.length - 1);
          } else {
            this.doc.addPage();
          }
        },
        layout: {
          width: 595.28,
          height: 841.89,
          margin: 20,
          headerHeight: 50,
          headerMargin: 10,
          pixelRatio: 1.333333,
        },
        trail,
        track,
        wayPoints,
        assets: injector.get(AssetsService),
        i18n: injector.get(I18nService),
        preferences,
        injector,
        environmentInjector,
        mapLayer: options.mapLayer,
      } as PdfContext;

      await this.generatePdf(ctx, options, percentDone);

      const range = ctx.doc.bufferedPageRange();
      for (let page = 0; page < range.count; page++) {
        ctx.doc.switchToPage(range.start + page);
        await generatePdfHeader(ctx);
        percentDone(1);
      }
      ctx.doc.end();
    });
  }

  private static async generatePdf(ctx: PdfContext, options: PdfOptions, progress: (done: number) => void) {
    switch (options.model) {
      case PdfModel.ONE_PAGE:
        await this.generateOnePageModel(ctx, options, progress);
        break;
      case PdfModel.BIG_MAP:
        await this.generateBigMapModel(ctx, options, progress);
        break;
    }
  }

  private static async generateOnePageModel(ctx: PdfContext, options: PdfOptions, progress: (done: number) => void, forceMetaOnLeft: boolean = false) {
    const hasDescription = options.includeDescription && ctx.trail.description?.trim()?.length;
    const hasWaypoints = options.includeWaypoints && hasWaypointsContent(ctx.wayPoints);

    const trackBounds = ctx.track.metadata.bounds;
    const widthMeters = trackBounds ? trackBounds.getNorthWest().distanceTo(trackBounds.getNorthEast()) : 0;
    const heightMeters = trackBounds ? trackBounds.getNorthWest().distanceTo(trackBounds.getSouthWest()) : 0;
    const x = ctx.layout.margin;
    const w = ctx.layout.width - ctx.layout.margin * 2;
    const wideMetaWidth = ctx.layout.width * 0.25;
    const wideMapWidth = w - wideMetaWidth - 5;
    const yMap = ctx.layout.headerHeight + ctx.layout.headerMargin;
    const elevationHeight = options.includeElevation ? 100 : 0;
    const wideMapHeight = (ctx.layout.height - ctx.layout.headerHeight - ctx.layout.margin - 20) / 3;
    const largeMapWidth = w / 2;
    const largeMapHeight = ctx.layout.height - ctx.layout.headerHeight - ctx.layout.headerMargin - ctx.layout.margin - elevationHeight - (!forceMetaOnLeft && (hasDescription || hasWaypoints) ? 175 : 0);
    const wideRatio = Math.min(widthMeters / wideMapWidth, heightMeters / wideMapHeight);
    const largeRatio = Math.min(widthMeters / largeMapWidth, heightMeters / largeMapHeight);
    const wider = wideRatio > largeRatio;

    if (wider) {
      const xMap = x + wideMetaWidth + 5;
      let y = yMap;
      if (options.qrCode) {
        y = await addQrCodeToPdf(ctx, options.qrCode, x, y, Math.min(wideMetaWidth, 120));
        y += 10;
      }
      y = await metaToPdf(ctx, x, y, wideMetaWidth);
      y += 10;
      progress(5);
      let endY1 = y;

      y = yMap;
      await generatePdfMap(ctx, xMap, yMap, wideMapWidth, wideMapHeight, options.includeWaypoints);
      progress(15);
      y += wideMapHeight;

      if (options.includeElevation) {
        if (endY1 <= y) {
          await generateElevationGraphToPdf(ctx, x, y, ctx.layout.width - ctx.layout.margin * 2, elevationHeight);
        } else {
          await generateElevationGraphToPdf(ctx, xMap, y, wideMapWidth, elevationHeight);
        }
        y += elevationHeight;
      }
      progress(15);
      y += 10;

      y = Math.max(y, endY1);
      if (hasDescription) {
        await addTitleToPdf(ctx, 1, ctx.i18n.texts.metadata.description, x, y, w);
        y = ctx.doc.y;
        await generatePdfText(ctx, ctx.trail.description, y, {x, width: w}, 11);
        y = ctx.doc.y;
      }
      progress(5);
      if (hasWaypoints) {
        const wpTitle = async (y: number, minSize: number, horiz: HorizBounds) => {
          if (y + 15 + minSize > ctx.layout.height - ctx.layout.margin) {
            y = ctx.layout.headerHeight + ctx.layout.headerMargin;
            if (horiz.nextPage) horiz = horiz.nextPage(horiz);
            else ctx.doc.addPage();
          }
          await addTitleToPdf(ctx, 1, ctx.i18n.texts.pages.trail.sections.waypoints.title, horiz.x, y, horiz.width);
          return {y: ctx.doc.y, horiz};
        }
        await generateWaypointsTextToPdf(ctx, y, {x, width: w}, wpTitle);
      }
      progress(5);
    } else {
      // --- larger ---
      await generatePdfMap(ctx, ctx.layout.width / 2, yMap, largeMapWidth, largeMapHeight, options.includeWaypoints);
      progress(15);
      if (options.includeElevation) {
        if (forceMetaOnLeft) {
          await generateElevationGraphToPdf(ctx, x, yMap + largeMapHeight, ctx.layout.width - ctx.layout.margin * 2, elevationHeight);
        } else {
          await generateElevationGraphToPdf(ctx, ctx.layout.width / 2, yMap + largeMapHeight, largeMapWidth, elevationHeight);
        }
      }
      progress(15);

      const leftWidth = ctx.layout.width / 2 - x - 5;
      let y = yMap;

      if (!forceMetaOnLeft && (hasDescription || hasWaypoints)) {
        await metaToPdf(ctx, ctx.layout.width / 2, yMap + largeMapHeight + elevationHeight + 5, largeMapWidth);
        progress(5);
      } else {
        y = await metaToPdf(ctx, x, y, leftWidth);
        y += 5;
        progress(5);
      }

      let horiz = {x, width: leftWidth, nextPage: current => { ctx.nextPage(); return {x: current.x, width: ctx.layout.width - current.x - ctx.layout.margin}; }} as HorizBounds;
      if (options.qrCode) {
        y = await addQrCodeToPdf(ctx, options.qrCode, x, y, Math.min(leftWidth, 120));
        y += 10;
      }
      if (hasDescription) {
        await addTitleToPdf(ctx, 1, ctx.i18n.texts.metadata.description, x, y, leftWidth);
        y = ctx.doc.y;
        const afterText = await generatePdfText(ctx, ctx.trail.description, y, horiz, 11);
        y = afterText.y;
        horiz = afterText.horiz;
      }
      progress(5);
      if (hasWaypoints) {
        const wpTitle = async (y: number, minSize: number, horiz: HorizBounds) => {
          if (y + 30 + minSize > ctx.layout.height - ctx.layout.margin) {
            y = ctx.layout.headerHeight + ctx.layout.headerMargin;
            if (horiz.nextPage) horiz = horiz.nextPage(horiz);
            else ctx.nextPage();
          }
          await addTitleToPdf(ctx, 1, ctx.i18n.texts.pages.trail.sections.waypoints.title, horiz.x, y, horiz.width);
          return {y: ctx.doc.y, horiz};
        }
        const afterText = await generateWaypointsTextToPdf(ctx, y, horiz, wpTitle);
        y = afterText.y;
        horiz = afterText.horiz;
      }
      progress(5);
      if (!forceMetaOnLeft && (hasDescription || hasWaypoints) && ctx.doc.bufferedPageRange().count === 1 && y < yMap + largeMapHeight - 175) {
        ctx.reset();
        await this.generateOnePageModel(ctx, options, progress, true);
      }
    }
  }

  private static async generateBigMapModel(ctx: PdfContext, options: PdfOptions, progress: (done: number) => void) {
    const hasDescription = options.includeDescription && ctx.trail.description?.trim()?.length;
    const hasWaypoints = options.includeWaypoints && hasWaypointsContent(ctx.wayPoints);

    const colWidth = (ctx.layout.width - ctx.layout.margin * 2) / 2 - 5;
    const x2 = ctx.layout.margin + colWidth + 10;
    let x = ctx.layout.margin;
    let y = ctx.layout.headerHeight + ctx.layout.headerMargin;
    let width = ctx.layout.width - ctx.layout.margin * 2;

    if (options.qrCode) {
      // QR Code and meta in 2 columns
      const w = Math.min(colWidth, 120);
      const y1 = await addQrCodeToPdf(ctx, options.qrCode, x, y, w);
      progress(15);
      const y2 = await metaToPdf(ctx, x + w + 25, y, Math.min(400, width - w - 25));
      progress(5);
      y = Math.max(y1 + 10, y2);
      let horiz = {x, width};
      if (hasDescription) {
        await addTitleToPdf(ctx, 1, ctx.i18n.texts.metadata.description, x, y, width);
        y = ctx.doc.y;
        const afterText = await generatePdfText(ctx, ctx.trail.description, y, horiz, 11);
        y = afterText.y;
      }
      progress(5);
      if (hasWaypoints) {
        const wpTitle = async (y: number, minSize: number, horiz: HorizBounds) => {
          if (y + 30 + minSize > ctx.layout.height - ctx.layout.margin) {
            ctx.doc.nextPage();
            y = ctx.layout.headerHeight + ctx.layout.headerMargin;
          }
          await addTitleToPdf(ctx, 1, ctx.i18n.texts.pages.trail.sections.waypoints.title, horiz.x, y, horiz.width);
          return {y: ctx.doc.y, horiz};
        }
        const afterText = await generateWaypointsTextToPdf(ctx, y, horiz, wpTitle);
        y = afterText.y;
      }
      progress(5);
    } else if (hasDescription && hasWaypoints) {
      // no QR Code, both description and waypoints => meta + description in 1 column, then waypoints in 2nd column
      y = await metaToPdf(ctx, x, y, colWidth);
      progress(10);
      await addTitleToPdf(ctx, 1, ctx.i18n.texts.metadata.description, x, y, colWidth);
      y = ctx.doc.y;
      let horiz = {x, width: colWidth, nextPage: (c1) => ({x: x2 + c1.x - x, width: c1.width, nextPage: (c2) => { ctx.nextPage(); return {x: x + c2.x - x2, width: width + c2.width - colWidth};}})} as HorizBounds;
      let after = await generatePdfText(ctx, ctx.trail.description, y, horiz, 11);
      y = after.y;
      horiz = after.horiz;
      progress(10);
      if (horiz.x === x && horiz.nextPage) {
        horiz = horiz.nextPage(horiz);
        y = ctx.layout.headerHeight + ctx.layout.headerMargin;
      }
      const wpTitle = async (y: number, minSize: number, horiz: HorizBounds) => {
        if (y + 30 + minSize > ctx.layout.height - ctx.layout.margin) {
          y = ctx.layout.headerHeight + ctx.layout.headerMargin;
            if (horiz.nextPage) horiz = horiz.nextPage(horiz);
            else ctx.nextPage();
        }
        await addTitleToPdf(ctx, 1, ctx.i18n.texts.pages.trail.sections.waypoints.title, horiz.x, y, horiz.width);
        return {y: ctx.doc.y, horiz};
      }
      await generateWaypointsTextToPdf(ctx, y, horiz, wpTitle);
      progress(10);
    } else {
      // else everything in 1 column
      y = await metaToPdf(ctx, x, y, Math.min(width, 400));
      progress(10);
      let horiz = {x, width: width};
      if (hasDescription) {
        await addTitleToPdf(ctx, 1, ctx.i18n.texts.metadata.description, x, y, width);
        y = ctx.doc.y;
        let after = await generatePdfText(ctx, ctx.trail.description, y, horiz, 11);
        y = after.y;
        horiz = after.horiz;
      }
      progress(10);
      if (hasWaypoints) {
        const wpTitle = async (y: number, minSize: number, horiz: HorizBounds) => {
          if (y + 30 + minSize > ctx.layout.height - ctx.layout.margin) {
            ctx.nextPage();
            y = ctx.layout.headerHeight + ctx.layout.headerMargin;
          }
          await addTitleToPdf(ctx, 1, ctx.i18n.texts.pages.trail.sections.waypoints.title, horiz.x, y, horiz.width);
          return {y: ctx.doc.y, horiz};
        }
        await generateWaypointsTextToPdf(ctx, y, horiz, wpTitle);
      }
      progress(10);
    }

    const trackBounds = ctx.track.metadata.bounds;
    const widthMeters = trackBounds ? trackBounds.getNorthWest().distanceTo(trackBounds.getNorthEast()) : 0;
    const heightMeters = trackBounds ? trackBounds.getNorthWest().distanceTo(trackBounds.getSouthWest()) : 0;
    if (widthMeters > heightMeters) {
      ctx.doc.addPage({
        layout: 'landscape'
      });
    } else {
      ctx.doc.addPage();
    }
    const elevationHeight = options.includeElevation ? 100 : 0;
    await generatePdfMap(
      ctx,
      ctx.layout.margin,
      ctx.layout.headerHeight + ctx.layout.headerMargin,
      ctx.doc.page.width - ctx.layout.margin * 2,
      ctx.doc.page.height - ctx.layout.headerHeight - ctx.layout.headerMargin - ctx.layout.margin - elevationHeight,
      options.includeWaypoints
    );
    progress(15);
    if (options.includeElevation) {
      await generateElevationGraphToPdf(
        ctx,
        ctx.layout.margin,
        ctx.doc.page.height - ctx.layout.margin - elevationHeight,
        ctx.doc.page.width - ctx.layout.margin * 2,
        elevationHeight
      );
    }
    progress(15);
  }

  private static _jsLoaded: string[] = [];
  private static _jsLoading = new Map<string, ((a:any) => void)[]>();

  public static loadJs(name: string, type?: string): Promise<any> {
    return new Promise((resolve) => {
      if (this._jsLoaded.includes(name)) {
        resolve(null);
        return;
      }
      const loading = this._jsLoading.get(name);
      if (loading) {
        loading.push(resolve);
        return;
      }
      this._jsLoading.set(name, [resolve]);
      const script = document.createElement('SCRIPT') as HTMLScriptElement;
      script.onload = function() {
        const listeners = PdfGenerator._jsLoading.get(name);
        PdfGenerator._jsLoading.delete(name);
        PdfGenerator._jsLoaded.push(name);
        for (const listener of listeners!) listener(null);
      }
      if (type) script.type = type;
      script.src = environment.assetsUrl + '/' + name;
      document.body.appendChild(script);
    });
  }

  private static _loadedCss: string[] = [];

  public static loadCss(name: string) {
    if (this._loadedCss.includes(name)) return;
    const style = document.createElement('LINK') as HTMLLinkElement;
    style.rel = "stylesheet";
    style.href = environment.assetsUrl + name;
    document.getElementsByTagName('HEAD')[0].appendChild(style);
    this._loadedCss.push(name);
  }

}
