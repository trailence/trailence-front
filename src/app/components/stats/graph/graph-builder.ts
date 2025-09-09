import { Injector } from '@angular/core';
import { StatsConfig, StatsTimeUnit, StatsValue } from '../stats-config';
import { combineLatest, map, Observable, of, switchMap } from 'rxjs';
import { ChartConfig } from './chart-config';
import { Trail } from 'src/app/model/trail';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { TrailCollection } from 'src/app/model/trail-collection';
import { TrailCollectionType } from 'src/app/model/dto/trail-collection';
import { TrailService } from 'src/app/services/database/trail.service';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { TrackService } from 'src/app/services/database/track.service';
import * as C from 'chart.js';
import { Color } from 'src/app/utils/color';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { ShareService } from 'src/app/services/database/share.service';
import { Share } from 'src/app/model/share';
import { TrackMetadataSnapshot } from 'src/app/model/snapshots';

C.Chart.register(C.LinearScale, C.BarController, C.CategoryScale, C.BarElement, C.PointElement);

export class GraphBuilder {

  constructor(
    private readonly injector: Injector,
  ) {
  }

  public build(cfg: StatsConfig, width: number, height: number, styles: CSSStyleDeclaration): Observable<ChartConfig | undefined> {
    return this.getAllItems(cfg).pipe(map(allItems => this.buildFrom(cfg, width, height, styles, allItems.filter(i => this.filter(i ,cfg)))));
  }

  private filter(item: Item, cfg: StatsConfig): boolean {
    if (cfg.activities.length > 0) {
      if (cfg.activities.indexOf(item.trail.activity) < 0) return false;
    }
    return true;
  }

  private getTimeValue(date: Date, cfg: StatsConfig): number {
    switch (cfg.timeUnit) {
      case StatsTimeUnit.YEAR: return date.getFullYear();
      case StatsTimeUnit.MONTH: return date.getFullYear() * 12 + date.getMonth();
      case StatsTimeUnit.MONTH_OF_YEAR: return date.getMonth();
    }
  }

  private getMinMaxTimeValue(cfg: StatsConfig): {min: number, max: number} {
    const now = new Date();
    switch (cfg.timeUnit) {
      case StatsTimeUnit.YEAR: return {min: now.getFullYear(), max: now.getFullYear()};
      case StatsTimeUnit.MONTH: return {min: now.getFullYear() * 12 + now.getMonth(), max: now.getFullYear() * 12 + now.getMonth()};
      case StatsTimeUnit.MONTH_OF_YEAR: return {min: 0, max: 11};
    }
  }

  private getTimeValueLabel(cfg: StatsConfig, timeValue: number): string {
    switch (cfg.timeUnit) {
      case StatsTimeUnit.YEAR: return '' + timeValue;
      case StatsTimeUnit.MONTH: {
        let m = '' + ((timeValue % 12) + 1);
        if (m.length === 1) m = '0' + m;
        return m + '/' + Math.floor(timeValue / 12);
      }
      case StatsTimeUnit.MONTH_OF_YEAR: return this.injector.get(I18nService).texts.months[timeValue];
    }
  }

  private getAmount(cfg: StatsConfig, item: Item): number {
    switch (cfg.value) {
      case StatsValue.NB_TRAILS: return 1;
      case StatsValue.DISTANCE: return item.meta.distance;
      case StatsValue.POSITIVE_ELEVATION: return item.meta.positiveElevation ?? 0;
      case StatsValue.NEGATIVE_ELEVATION: return item.meta.negativeElevation ?? 0;
      case StatsValue.DURATION: return (item.meta.duration ?? 0) - item.meta.breaksDuration;
    }
  }

  private getStepSize(cfg: StatsConfig, max: number): number {
    switch (cfg.value) {
      case StatsValue.NB_TRAILS: return 1;
      case StatsValue.DISTANCE: return max >= 2000 ? 1000 : 100;
      case StatsValue.POSITIVE_ELEVATION: return max >= 300 ? 50 : 1;
      case StatsValue.NEGATIVE_ELEVATION: return max >= 300 ? 50 : 1;
      case StatsValue.DURATION: return max >= 2 * 24 * 60 * 60 * 1000 ? 12 * 60 * 60 * 1000 : max >= 3 * 60 * 60 * 1000 ? 60 * 60 * 1000 : 15 * 60 * 1000;
    }
  }

  private getMax(cfg: StatsConfig, max: number): number {
    switch (cfg.value) {
      case StatsValue.NB_TRAILS: return max;
      case StatsValue.DISTANCE: return max >= 2000 ? (Math.floor(max / 1000) + 1) * 1000 : (Math.floor(max / 100) + 1) * 100;
      case StatsValue.POSITIVE_ELEVATION: return max >= 300 ? (Math.floor(max / 50) + 1) * 50 : (Math.floor(max / 10) + 1) * 10;
      case StatsValue.NEGATIVE_ELEVATION: return max >= 300 ? (Math.floor(max / 50) + 1) * 50 : (Math.floor(max / 10) + 1) * 10;
      case StatsValue.DURATION:
        return max >= 2 * 24 * 60 * 60 * 1000 ? (Math.floor(max / (24 * 60 * 60 * 1000)) + 1) * 24 * 60 * 60 * 1000 :
          max >= 3 * 60 * 60 * 1000 ? (Math.floor(max / (60 * 60 * 1000)) + 1) * 60 * 60 * 1000 :
          (Math.floor(max / (15 * 60 * 1000)) + 1) * 15 * 60 * 1000;
    }
  }

  private getTickLabel(cfg: StatsConfig, value: number): string {
    switch (cfg.value) {
      case StatsValue.NB_TRAILS: return '' + value;
      case StatsValue.DISTANCE: return this.injector.get(I18nService).distanceToString(value);
      case StatsValue.POSITIVE_ELEVATION: return this.injector.get(I18nService).elevationToString(value);
      case StatsValue.NEGATIVE_ELEVATION: return this.injector.get(I18nService).elevationToString(value);
      case StatsValue.DURATION: return this.injector.get(I18nService).durationToString(value, false, false, true);
    }
  }

  private getMaxDataShown(cfg: StatsConfig, min: number, max: number, width: number): number {
    const nb = max - min + 1;
    if (cfg.timeUnit !== StatsTimeUnit.MONTH) return nb;
    if (nb <= Math.floor(width / 75)) return nb;
    let r = Math.floor((width - 50) / 75);
    if (r < 8) r = Math.floor((width - 50) / 50);
    if (r < 8) r = Math.floor((width - 50) / 30);
    return r;
  }

  private buildFrom(cfg: StatsConfig, width: number, height: number, styles: CSSStyleDeclaration, allItems: Item[]): ChartConfig {
    const minMax = this.getMinMaxTimeValue(cfg);
    let byTimeValue = new Map<number, number>();
    for (const item of allItems) {
      const ts = item.trail.date ?? item.meta.startDate;
      if (!ts) continue;
      const date = new Date(ts);
      const timeValue = this.getTimeValue(date, cfg);
      if (timeValue > minMax.max) minMax.max = timeValue;
      if (timeValue < minMax.min) minMax.min = timeValue;
      byTimeValue.set(timeValue, (byTimeValue.get(timeValue) ?? 0) + this.getAmount(cfg, item));
    }
    const labels: string[] = [];
    const data: number[] = [];
    let maxValue = 0;
    for (let timeValue = minMax.min; timeValue <= minMax.max; timeValue++) {
      labels.push(this.getTimeValueLabel(cfg, timeValue));
      const value = byTimeValue.get(timeValue) ?? 0;
      data.push(value);
      if (value > maxValue) maxValue = value;
    }
    const textColor = styles.getPropertyValue('--ion-text-color');
    const that = this;
    return {
      type: 'bar',
      options: {
        backgroundColor: styles.getPropertyValue('--ion-background-color'),
        color: textColor,
        scales: {
          y: {
            beginAtZero: true,
            min: 0,
            max: this.getMax(cfg, maxValue),
            border: {
              color: textColor,
            },
            ticks: {
              color: textColor,
              stepSize: this.getStepSize(cfg, maxValue),
              callback: (tickValue, index, ticks) => {
                return this.getTickLabel(cfg, tickValue as number);
              },
            },
            grid: {
              color: new Color(textColor).setAlpha(0.33).toString()
            }
          },
          x: {
            border: {
              color: textColor,
            },
            ticks: {
              color: textColor,
            },
          }
        },
        events: [],
        animation: {
          onComplete: function() {
            const ctx = this.ctx;

            ctx.textAlign = 'center';
            ctx.fillStyle = textColor;

            const chart = this;
            this.data.datasets.forEach(function(dataset, i) {
              const meta = chart.getDatasetMeta(i);
              meta.data.forEach(function(bar, index) {
                const data = dataset.data[index] as number;
                const str = that.getTickLabel(cfg, data);
                const maxWidth = (bar as any).width * 1.1;
                let fontSize = (C.defaults.font.size ?? 12) + 2;
                ctx.font = fontSize + 'px ' + C.defaults.font.family;
                let metrics = ctx.measureText(str);
                while (metrics.width > maxWidth && fontSize > 11) {
                  fontSize--;
                  ctx.font = fontSize + 'px ' + C.defaults.font.family;
                  metrics = ctx.measureText(str);
                }
                let x, y;
                if (metrics.width > maxWidth) {
                  y = bar.y + 2 + metrics.width / 2;
                  if (y + metrics.width / 2 > chart.chartArea.height) y = chart.chartArea.height - metrics.width / 2;
                  ctx.textBaseline = 'middle';
                  ctx.translate(bar.x + 1, y);
                  ctx.rotate(-Math.PI / 2);
                  x = 0;
                  y = 0;
                } else {
                  ctx.textBaseline = 'bottom';
                  x = bar.x;
                  if (bar.y <= meta.yScale!.top + 15) {
                    y = bar.y + 17;
                  } else {
                    y = bar.y - 2;
                  }
                }
                ctx.fillText(str, x, y);
                ctx.setTransform(1, 0, 0, 1, 0, 0);
              });
            });
          },
        }
      },
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: 'rgba(' + styles.getPropertyValue('--ion-color-tertiary-rgb') + ', 0.66)',
          borderColor: styles.getPropertyValue('--ion-color-tertiary'),
          borderWidth: 1,
          maxBarThickness: 200,
        }]
      },
      maxDataShown: this.getMaxDataShown(cfg, minMax.min, minMax.max, width),
    };
  }

  private getAllItems(cfg: StatsConfig): Observable<Item[]> {
    if (Array.isArray(cfg.source)) {
      return combineLatest([
        this.injector.get(TrailCollectionService).getAllCollectionsReady$(),
        this.injector.get(ShareService).getAllReady$(),
      ]).pipe(
        switchMap(([collections, shares]) => {
          const selectedCollections: TrailCollection[] = [];
          const selectedShares: Share[] = [];
          for (const src of cfg.source) {
            if (src.type === 'collection') {
              if (src.uuid === 'my_trails') {
                const col = collections.find(c => c.type === TrailCollectionType.MY_TRAILS)
                if (col && selectedCollections.indexOf(col) < 0) selectedCollections.push(col);
              } else if (src.owner === this.injector.get(AuthService).email) {
                const col = collections.find(c => c.uuid === src.uuid)
                if (col && selectedCollections.indexOf(col) < 0) selectedCollections.push(col);
              } else {
                const share = shares.find(s => s.uuid === src.uuid && s.owner === src.owner);
                if (share && selectedShares.indexOf(share) < 0) selectedShares.push(share);
              }
            }
          }
          if (selectedCollections.length === 0 && selectedShares.length === 0) return of([]);
          return this.injector.get(TrailService).getAllWhenLoaded$().pipe(
            collection$items(),
            switchMap(allTrails => {
              const selectedTrails = allTrails.filter(trail => !!selectedCollections.find(c => c.uuid === trail.collectionUuid) || !!selectedShares.find(s => s.owner === trail.owner && s.trails.indexOf(trail.uuid) >= 0));
              if (selectedTrails.length === 0) return of([]);
              return this.injector.get(TrackService).getMetadataList$(selectedTrails.map(t => ({owner: t.owner, uuid: t.currentTrackUuid}))).pipe(
                collection$items(),
                map(tracks => {
                  return tracks.map(track => ({
                    trail: selectedTrails.find(t => t.owner === track.owner && t.currentTrackUuid === track.uuid)!,
                    meta: track,
                  }));
                })
              );
            })
          );
        })
      );
    }
    return of([]);
  }

}

interface Item {
  trail: Trail;
  meta: TrackMetadataSnapshot;
}
