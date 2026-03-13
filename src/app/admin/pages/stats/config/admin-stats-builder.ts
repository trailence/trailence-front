import { GraphConfig, GraphProvider } from 'src/app/components/graph/graph-config';
import { AdminStatsAggregation, AdminStatsConfig } from './admin-stats-config';
import { map, Observable, of } from 'rxjs';
import { Injector } from '@angular/core';
import { HttpService } from 'src/app/services/http/http.service';
import { environment } from 'src/environments/environment';
import * as C from 'chart.js';
import { Color } from 'src/app/utils/color';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { StringUtils } from 'src/app/utils/string-utils';

C.Chart.register(C.LinearScale, C.LineController, C.CategoryScale, C.LineElement, C.PointElement, C.Tooltip);

export class AdminStatsBuilder implements GraphProvider<AdminStatsConfig> {

  constructor(
    private readonly injector: Injector,
  ) {}

  buildGraphConfig(source: AdminStatsConfig, width: number, height: number, styles: CSSStyleDeclaration): Observable<GraphConfig | undefined> {
    const textColor = styles.getPropertyValue('--ion-text-color');
    const backgroundColor = styles.getPropertyValue('--ion-background-color');
    const tertiaryColor = styles.getPropertyValue('--ion-color-tertiary');
    const xLabel = this.getXLabelProvider(source);
    return this.injector.get(HttpService).get<StatsValueDto[]>(environment.apiBaseUrl + '/admin/stats/v1?type=' + source.type + '&aggregation=' + source.aggregation)
    .pipe(
      map(stats => ({
        type: 'line',
        options: {
          backgroundColor: backgroundColor,
          color: textColor,
          responsive: false,
          normalized: true,
          elements: {
            point: {
              radius: 0,
            },
          },
          scales: {
            y: {
              border: {
                color: textColor,
              },
              ticks: {
                color: textColor,
              },
              grid: {
                color: new Color(textColor).setAlpha(0.33).toString()
              }
            },
            x: {
              type: 'linear',
              border: {
                color: textColor,
              },
              ticks: {
                color: textColor,
                ...this.getTimeTicksConfig(source)
              },
            }
          },
          events: ['mousemove', 'mouseout', 'click', 'mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend'],
          interaction: {
            intersect: false,
            mode: 'nearest',
            axis: 'x',
          },
          plugins: {
            tooltip: {
              callbacks: {
                title(tooltipItems) {
                  return xLabel(tooltipItems[0].parsed.x!);
                },
              }
            }
          }
        },
        data: {
          datasets: [{
            data: this.buildData(source.aggregation, stats),
            borderColor: tertiaryColor,
          }]
        },
        maxDataShown: undefined,
      }))
    );
  }

  private buildData(aggregation: AdminStatsAggregation, stats: StatsValueDto[]): C.Point[] {
    switch (aggregation) {
      case AdminStatsAggregation.DAY: return this.buildDailyData(stats);
      case AdminStatsAggregation.WEEK: return this.buildWeeklyData(stats);
      case AdminStatsAggregation.MONTH: return this.buildMonthlyData(stats);
      case AdminStatsAggregation.YEAR: return this.buildYearlyData(stats);
    }
  }

  private buildDailyData(stats: StatsValueDto[]): C.Point[] {
    return stats.map(v => ({
      x: Math.floor(Date.UTC(v.year, v.month! - 1, v.day!) / (24 * 60 * 60 * 1000)),
      y: v.value,
    }));
  }

  private buildWeeklyData(stats: StatsValueDto[]): C.Point[] {
    return stats.map(v => ({
      x: v.year * 52 + v.week! - 1,
      y: v.value,
    }));
  }

  private buildMonthlyData(stats: StatsValueDto[]): C.Point[] {
    return stats.map(v => ({
      x: v.year * 12 + v.month! - 1,
      y: v.value,
    }));
  }

  private buildYearlyData(stats: StatsValueDto[]): C.Point[] {
   return stats.map(v => ({
      x: v.year,
      y: v.value,
    }));
  }

  private getXLabelProvider(cfg: AdminStatsConfig): (value: number) => string {
    switch (cfg.aggregation) {
      case AdminStatsAggregation.DAY:
        return (value) => this.injector.get(I18nService).timestampToDateString((value as number) * 24 * 60 * 60 * 1000);
      case AdminStatsAggregation.MONTH:
        return (value) => {
          const year = Math.floor(value / 12);
          const month = value % 12;
          return year + '-' + StringUtils.padLeft('' + (month + 1), 2, '0');
        };
      case AdminStatsAggregation.WEEK:
        return (value) => {
          const year = Math.floor(value / 52);
          const week = value % 52;
          return year + ' W' + StringUtils.padLeft('' + (week + 1), 2, '0');
        };
      case AdminStatsAggregation.YEAR:
        return (value) => '' + value;
        break;
    }
  }

  private getTimeTicksConfig(cfg: AdminStatsConfig): Partial<C.TickOptions> {
    const xLabel = this.getXLabelProvider(cfg);
    const options: Partial<C.TickOptions> = {
      callback: (value) => xLabel(value as number),
    };
    switch (cfg.aggregation) {
      case AdminStatsAggregation.YEAR:
        (options as any).stepSize = 1;
        break;
    }
    return options;
  }

}

interface StatsValueDto {
  year: number;
  month: number | null | undefined;
  week: number | null | undefined;
  day: number | null | undefined;
  value: number;
}
