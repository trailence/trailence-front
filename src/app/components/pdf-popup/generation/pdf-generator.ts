import { EnvironmentInjector, Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Trail } from 'src/app/model/trail';
import { AssetsService } from 'src/app/services/assets/assets.service';
import { TrackService } from 'src/app/services/database/track.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { environment } from 'src/environments/environment';
import { defaultNextPage, HorizBounds, PdfContext } from './pdf-context';
import { generatePdfHeader } from './pdf-header';
import { generatePdfMap } from './pdf-map';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { metaToPdf } from './pdf-meta';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { ComputedWayPoint, Track } from 'src/app/model/track';
import { generateElevationGraphToPdf } from './pdf-elevation-graph';
import { addQrCodeToPdf } from './pdf-qrcode';
import { hasWaypointsContent } from '../waypoints-utils';
import { MapLayer } from 'src/app/services/map/map-layers.service';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { Console } from 'src/app/utils/console';
import { BinaryContent } from 'src/app/utils/binary-content';
import { PdfFixedColumnsLayout, pdfFullWidth, PdfSectionGenerator } from './pdf-layout-helper';
import { generateDescriptionAndWaypoints } from './pdf-description-and-waypoints';

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
  includeAvatar?: 'small' | 'large';
  includePhoto: boolean;
  mapLayer: MapLayer;
}

export class PdfGenerator {

  public static generate(injector: Injector, environmentInjector: EnvironmentInjector, trail: Trail, track: Track | undefined, wayPoints: ComputedWayPoint[], avatar: Blob | undefined, photo: ArrayBuffer | undefined, options: PdfOptions, progress: (percent: number) => void): Promise<Blob> { // NOSONAR
    return new Promise<Blob>(async (resolve) => {
      let percent = 0;
      let percentDone = (done: number) => { percent = Math.min(100, percent + done); progress(percent); };
      let roboto: ArrayBuffer;
      let robotoBold: ArrayBuffer;
      // progress: 10% for resources
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
      const trailInfo = trail.owner.includes('@') ? undefined : await firstValueFrom(injector.get(FetchSourceService).getTrailInfo$(trail.owner, trail.uuid));
      const lang = preferences.preferences.lang;
      const trailName = trailInfo?.lang && trailInfo.lang !== lang && trailInfo.nameTranslations?.[lang] ? trailInfo.nameTranslations[lang] : trail.name;
      let description: string | undefined = options.includeDescription ?
        (trailInfo?.lang && trailInfo.lang !== lang && trailInfo.descriptionTranslations?.[lang] ? trailInfo.descriptionTranslations[lang] : trail.description) :
        undefined;
      if (!description?.trim().length) description = undefined;
      let avatarImage = undefined;
      if (options.includeAvatar && avatar) {
        avatarImage = await createRoundedAvatar(avatar);
      }
      let photoCtx: {photo: ArrayBuffer, width: number, height: number} | undefined = undefined;
      if (options.includePhoto && !!photo) {
        photoCtx = await getPhotoCtx(photo);
      }
      percentDone(5); // 15%
      const doc = new (globalThis as any).PDFDocument(opts);
      doc.registerFont('Roboto', roboto!);
      doc.registerFont('Roboto-Bold', robotoBold!);
      const stream = doc.pipe((globalThis as any).blobStream());
      stream.on('finish', function() {
        percentDone(2);
        const blob = stream.toBlob('application/pdf');
        resolve(blob);
      });
      percentDone(2); // 17%
      const ctx = {
        doc,
        sandbox() {
          const doc = new (globalThis as any).PDFDocument(opts);
          doc.registerFont('Roboto', roboto);
          doc.registerFont('Roboto-Bold', robotoBold);
          return doc;
        },
        nextPage() {
          if (this.doc.page === this.doc._pageBuffer.at(-1)) {
            this.doc.addPage();
            this.doc.y = this.layout.headerHeight + this.layout.headerMargin;
          } else {
            this.doc.switchToPage(this.doc._pageBuffer.length - 1);
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
        trailInfo,
        trailName,
        description,
        avatar: avatarImage,
        avatarSize: options.includeAvatar,
        photo: photoCtx,
        assets: injector.get(AssetsService),
        i18n: injector.get(I18nService),
        preferences,
        injector,
        environmentInjector,
        mapLayer: options.mapLayer,
      } as PdfContext;

      await this.generatePdf(ctx, options, percentDone, 80);

      const range = ctx.doc.bufferedPageRange();
      for (let page = 0; page < range.count; page++) {
        ctx.doc.switchToPage(range.start + page);
        await generatePdfHeader(ctx);
        percentDone(1);
      }
      ctx.doc.end();
    });
  }

  private static async generatePdf(ctx: PdfContext, options: PdfOptions, progress: (done: number) => void, workAmount: number) {
    switch (options.model) {
      case PdfModel.ONE_PAGE:
        await this.generateOnePageModel(ctx, options, progress, workAmount);
        break;
      case PdfModel.BIG_MAP:
        await this.generateBigMapModel(ctx, options, progress, workAmount);
        break;
    }
  }

  private static readonly qrCodeGenerator: PdfSectionGenerator = async function (ctx: PdfContext, options: PdfOptions, x: number, y: number, width: number): Promise<number> {
    return await addQrCodeToPdf(ctx, options.qrCode!, x, y, width, 64);
  }

  private static getPhotoSize(ctx: PdfContext, maxWidth: number, maxHeight?: number): {width: number, height: number} {
    let width = ctx.photo!.width * 1.33333333;
    let height = ctx.photo!.height * 1.33333333;
    if (width > maxWidth) {
      height = height * (maxWidth / width);
      width = maxWidth;
    }
    if (maxHeight && height > maxHeight) {
      const ratio = maxHeight / height;
      height = maxHeight;
      width *= ratio;
    }
    return {width, height};
  }

  private static photoGenerator(maxHeight?: number): PdfSectionGenerator {
    return async function (ctx: PdfContext, options: PdfOptions, x: number, y: number, width: number): Promise<number> {
      const size = PdfGenerator.getPhotoSize(ctx, width, maxHeight);
      ctx.doc.image(ctx.photo!.photo, x, y, size);
      return y + size.height;
    }
  }

  private static readonly metaGenerator: PdfSectionGenerator = async function (ctx: PdfContext, options: PdfOptions, x: number, y: number, width: number): Promise<number> {
    return await metaToPdf(ctx, x, y, width);
  }

  private static mapGenerator(height: number): PdfSectionGenerator {
    return async function (ctx: PdfContext, options: PdfOptions, x: number, y: number, width: number): Promise<number> {
      await generatePdfMap(ctx, x, y, width, height, options.includeWaypoints);
      return y + height;
    }
  }

  private static elevationGraphGenerator(height: number): PdfSectionGenerator {
    return async function (ctx: PdfContext, options: PdfOptions, x: number, y: number, width: number): Promise<number> {
      await generateElevationGraphToPdf(ctx, x, y, width, height);
      return y + height;
    }
  }

  private static async generateOnePageModel(ctx: PdfContext, options: PdfOptions, progress: (done: number) => void, workAmount: number) {
    const userLang = ctx.preferences.preferences.lang;
    const sourceLang = ctx.trailInfo?.lang ?? userLang;
    const hasWaypoints = options.includeWaypoints && hasWaypointsContent(ctx.wayPoints, sourceLang, userLang);

    const trackBounds = ctx.track.metadata.bounds;
    const widthMeters = trackBounds ? trackBounds.getNorthWest().distanceTo(trackBounds.getNorthEast()) : 0;
    const heightMeters = trackBounds ? trackBounds.getNorthWest().distanceTo(trackBounds.getSouthWest()) : 0;
    const x = ctx.layout.margin;
    const w = ctx.layout.width - ctx.layout.margin * 2;
    const wideMetaWidth = ctx.layout.width * 0.25;
    const wideMapWidth = w - wideMetaWidth - 5;
    let yMap = ctx.layout.headerHeight + ctx.layout.headerMargin;
    const elevationHeight = options.includeElevation ? 100 : 0;
    let wideMapHeight = (ctx.layout.height - ctx.layout.headerHeight - ctx.layout.margin - 20) / 3;
    const largeMapWidth = w / 2;
    let largeMapHeight = ctx.layout.height - ctx.layout.headerHeight - ctx.layout.headerMargin - ctx.layout.margin - elevationHeight - 175;
    if (options.includeAvatar === 'large') {
      yMap += 10;
      largeMapHeight -= 10;
      wideMapHeight -= 10;
    }
    const wideRatio = Math.min(widthMeters / wideMapWidth, heightMeters / wideMapHeight);
    const largeRatio = Math.min(widthMeters / largeMapWidth, heightMeters / largeMapHeight);
    const wider = wideRatio > largeRatio;

    const work = new WorkItems(ctx, options, hasWaypoints, workAmount, progress);

    if (wider) {
      const cols = new PdfFixedColumnsLayout(x, yMap, [{width: wideMetaWidth, gap: 5}, {width: wideMapWidth, gap: 0}], ctx, options);
      if (ctx.photo) await cols.generate(0, this.photoGenerator(), 3);
      work.photoDone();
      await cols.generate(0, this.metaGenerator, 10);
      work.metaDone();
      await cols.generate(1, this.mapGenerator(wideMapHeight), 0);
      work.mapDone();
      if (options.qrCode) await cols.generate(0, this.qrCodeGenerator, 10);
      work.qrDone();
      if (options.includeElevation) {
        if (cols.getColumnHeight(0) > cols.getColumnHeight(1)) {
          await cols.generate(1, this.elevationGraphGenerator(elevationHeight), 0);
          cols.close(ctx);
        } else {
          cols.close(ctx);
          await pdfFullWidth(this.elevationGraphGenerator(elevationHeight), ctx, options);
        }
      }
      work.elevationDone();
      await generateDescriptionAndWaypoints(ctx, options, hasWaypoints, ctx.doc.y + 10, {x, width: w, nextPage: defaultNextPage(ctx)});
      work.descriptionDone();
      work.waypointsDone();
    } else {
      // --- larger ---
      const col1Width = ctx.layout.width - x - ctx.layout.margin - 5 - largeMapWidth;
      const cols = new PdfFixedColumnsLayout(x, yMap, [{width: col1Width, gap: 5}, {width: largeMapWidth, gap: 0}], ctx, options);
      if (ctx.photo) await cols.generate(0, this.photoGenerator(220), 3);
      work.photoDone();
      await cols.generate(1, this.mapGenerator(largeMapWidth), 0);
      work.mapDone();
      await cols.generate(0, this.metaGenerator, 10);
      work.metaDone();
      if (options.qrCode) await cols.generate(0, this.qrCodeGenerator, 10);
      work.qrDone();
      await cols.generate(1, this.elevationGraphGenerator(elevationHeight), 0);
      work.elevationDone();
      const y1 = cols.getColumnHeight(0);
      const y2 = cols.getColumnHeight(1);
      cols.close(ctx);
      if (y1 < y2 - 150) {
        // important space remaining in column 1 => try to fill it
        ctx.doc.y = y1;
        let horiz: HorizBounds = {x, width: col1Width, nextPage: current => {
          if (y2 > ctx.layout.height - ctx.layout.margin - 150) return defaultNextPage(ctx)(current);
          ctx.doc.y = y2 + 10;
          return {x: x + col1Width + 5, width: largeMapWidth, nextPage: defaultNextPage(ctx)};
        }};
        await generateDescriptionAndWaypoints(ctx, options, hasWaypoints, ctx.doc.y + 10, horiz);
      } else {
        await generateDescriptionAndWaypoints(ctx, options, hasWaypoints, ctx.doc.y + 10, {x, width: w, nextPage: defaultNextPage(ctx)});
      }
      work.descriptionDone();
      work.waypointsDone();
    }
  }

  private static async generateBigMapModel(ctx: PdfContext, options: PdfOptions, progress: (done: number) => void, workAmount: number) {
    const userLang = ctx.preferences.preferences.lang;
    const sourceLang = ctx.trailInfo?.lang ?? userLang;
    const hasWaypoints = options.includeWaypoints && hasWaypointsContent(ctx.wayPoints, sourceLang, userLang);

    let x = ctx.layout.margin;
    let y = ctx.layout.headerHeight + ctx.layout.headerMargin;
    let width = ctx.layout.width - ctx.layout.margin * 2;

    const work = new WorkItems(ctx, options, hasWaypoints, workAmount, progress);

    ctx.doc.y = y;
    if (ctx.photo || options.qrCode) {
      const photoSize = ctx.photo ? this.getPhotoSize(ctx, 225, 200) : {width: 0, height: 0};
      let colX = x;
      let maxY = y;
      if (ctx.photo) {
        maxY = await this.photoGenerator(200)(ctx, options, x, y, photoSize.width);
        colX += photoSize.width + 5;
      }
      work.photoDone();
      const metaWidth = Math.min(400, ctx.layout.width - colX - (options.qrCode ? 96 + 5 : 0) - ctx.layout.margin);
      const metaHeight = await this.metaGenerator(ctx, options, colX, y, metaWidth);
      colX += metaWidth + 5;
      maxY = Math.max(maxY, metaHeight);
      work.metaDone();
      if (options.qrCode) {
        const qrHeight = await this.qrCodeGenerator(ctx, options, colX, y + (options.includeAvatar === 'large' ? 20 : 0), 96);
        maxY = Math.max(maxY, qrHeight);
      }
      work.qrDone();
      ctx.doc.y = maxY + 10;
    } else {
      const metaHeight = await this.metaGenerator(ctx, options, x, y, 400);
      ctx.doc.y = metaHeight + 10;
      work.metaDone();
    }

    await generateDescriptionAndWaypoints(ctx, options, hasWaypoints, ctx.doc.y, {x, width, nextPage: defaultNextPage(ctx)});
    work.descriptionDone();
    work.waypointsDone();

    // page with map
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
    work.mapDone();
    if (options.includeElevation) {
      await generateElevationGraphToPdf(
        ctx,
        ctx.layout.margin,
        ctx.doc.page.height - ctx.layout.margin - elevationHeight,
        ctx.doc.page.width - ctx.layout.margin * 2,
        elevationHeight
      );
    }
    work.elevationDone();
  }

  private static readonly _jsLoaded: string[] = [];
  private static readonly _jsLoading = new Map<string, ((a:any) => void)[]>();

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

  private static readonly _loadedCss: string[] = [];

  public static loadCss(name: string) {
    if (this._loadedCss.includes(name)) return;
    const style = document.createElement('LINK') as HTMLLinkElement;
    style.rel = "stylesheet";
    style.href = environment.assetsUrl + name;
    document.getElementsByTagName('HEAD')[0].appendChild(style);
    this._loadedCss.push(name);
  }

}

function createRoundedAvatar(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('IMG') as HTMLImageElement;
    const urlCreator = globalThis.URL || globalThis.webkitURL;
    img.onload = (e) => {
      try {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        const size = Math.min(width, height);
        const canvas = document.createElement('CANVAS') as HTMLCanvasElement;
        canvas.width = size;
        canvas.height = size;
        canvas.style.position = 'fixed';
        canvas.style.top = '-1000px';
        canvas.style.left = '-1000px';
        document.documentElement.appendChild(canvas);
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        const dx = width - size;
        const dy = height - size;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, 0, 0, width, height, -dx / 2, -dy / 2, size, size);
        urlCreator.revokeObjectURL(img.src);
        canvas.toBlob(
          b => {
            if (b) {
              if (!!b.arrayBuffer) { // NOSONAR
                b.arrayBuffer().then(resolve).catch(reject);
              } else {
                try {
                  const base64 = canvas.toDataURL('image/png');
                  BinaryContent.fromDataURL(base64).toArrayBuffer().then(b => resolve(b)).
                  catch(e => {
                    Console.warn('Error converting data URL to blob', e);
                    reject('Unable to generate PNG');
                  });
                } catch (e) {
                  Console.warn('Error converting blob to PNG data URL', e);
                  reject('Unable to generate PNG');
                }
              }
              canvas.remove();
            } else {
              reject('Unable to generate PNG');
            }
          },
          "image/png"
        )
      } catch (e) {
        Console.warn('Error converting photo', e);
        reject('Error converting photo');
      }
    };
    img.onerror = () => reject('Error loading photo');
    img.src = urlCreator.createObjectURL(blob);
  });
}

function getPhotoCtx(photo: ArrayBuffer): Promise<{photo: ArrayBuffer, width: number, height: number}> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('IMG') as HTMLImageElement;
    const urlCreator = globalThis.URL || globalThis.webkitURL;
    img.onload = (e) => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      resolve({photo, width, height});
    };
    img.onerror = () => reject('Error loading photo');
    img.src = urlCreator.createObjectURL(new Blob([photo]));
  });
}

class WorkItems {

  private meta: number;
  private map: number;
  private photo: number;
  private description: number;
  private wayPoints: number;
  private elevation: number;
  private qrCode: number;

  private percentRemaining: number;

  constructor(
    ctx: PdfContext, options: PdfOptions, hasWayPoints: boolean,
    workAmount: number,
    private readonly percentDone: (pc: number) => void
  ) {
    this.percentRemaining = workAmount;
    this.meta = 5;
    this.map = 15;
    this.photo = ctx.photo ? 3 : 0;
    this.description = ctx.description ? 2 : 0;
    this.elevation = options.includeElevation ? 5 : 0;
    this.qrCode = options.qrCode ? 2 : 0;
    this.wayPoints = hasWayPoints ? 5 : 0;
  }

  private getRemainingItems(): number {
    return this.meta + this.map + this.photo + this.description + this.wayPoints + this.elevation + this.qrCode;
  }

  private itemDone(amount: number): void {
    if (amount === 0) return;
    const pc = Math.floor(this.percentRemaining / this.getRemainingItems() * amount);
    this.percentDone(pc);
    this.percentRemaining -= pc;
  }

  public metaDone(): void {
    this.itemDone(this.meta);
    this.meta = 0;
  }

  public mapDone(): void {
    this.itemDone(this.map);
    this.map = 0;
  }

  public photoDone(): void {
    this.itemDone(this.photo);
    this.photo = 0;
  }

  public descriptionDone(): void {
    this.itemDone(this.description);
    this.description = 0;
  }

  public elevationDone(): void {
    this.itemDone(this.elevation);
    this.elevation = 0;
  }

  public qrDone(): void {
    this.itemDone(this.qrCode);
    this.qrCode = 0;
  }

  public waypointsDone(): void {
    this.itemDone(this.wayPoints);
    this.wayPoints = 0;
  }

}
