import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Injector, Input, Output, SimpleChanges, ViewChild } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { Track } from 'src/app/model/track';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import * as C from 'chart.js';
import * as L from 'leaflet';
import { getRelativePosition } from 'chart.js/helpers';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { Color } from 'src/app/utils/color';
import { HoverVerticalLine } from './plugins/hover-vertical-line';
import { GraphPointReference, GraphRange } from './graph-events';
import { BackgroundPlugin } from './plugins/background';
import { RangeSelection, RangeSelectionEvent, SelectedRange } from './plugins/range-selection';
import { Point } from 'src/app/model/point';
import { TrackUtils } from 'src/app/utils/track-utils';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { ElevationLegendPlugin } from './plugins/elevation-legend';
import { PointReference, RangeReference } from 'src/app/model/point-reference';
import { ESTIMATED_SMALL_BREAK_EVERY, estimateSmallBreakTime, estimateSpeedInMetersByHour } from 'src/app/services/track-edition/time/time-estimation';
import { SpeedLegendPlugin } from './plugins/speed-legend';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { debounceTime } from 'rxjs';
import { PositionPlugin } from './plugins/position';

C.Chart.register(C.LinearScale, C.LineController, C.PointElement, C.LineElement, C.Filler, C.Tooltip);

const SPEED_ESTIMATION_COLOR = '#C0C040';

export interface DataPoint {
  x: number;
  y: number | null;
  segmentIndex: number;
  pointIndex: number;
  time?: number;
  timeSinceStart?: number;
  timeSinceLastSpeed: number;
  lat: number;
  lng: number;
  ele?: number;
  distanceMeters: number;
  distanceFromPrevious: number;
  distanceSinceLastSpeed: number;
  grade: {gradeBefore: number | undefined; gradeAfter: number | undefined};
  eleAccuracy?: number;
  posAccuracy?: number;
  speedInMeters: number;
  isBreakPoint?: boolean;
  estimatedSpeed?: number;
  originalDataIndex?: number;
}

export type GraphType = 'elevation' | 'speed';

@Component({
    selector: 'app-trail-graph',
    templateUrl: './trail-graph.component.html',
    styleUrls: ['./trail-graph.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        BaseChartDirective
    ]
})
export class TrailGraphComponent extends AbstractComponent {

  @Input() track1!: Track
  @Input() track2?: Track;
  @Input() selectable = false;
  @Input() selection?: RangeReference[] | PointReference[];
  @Input() graphType!: GraphType;

  @Output() pointHover = new EventEmitter<GraphPointReference[]>();
  @Output() pointClick = new EventEmitter<GraphPointReference[]>();

  @Output() selecting = new EventEmitter<GraphRange[] | undefined>();
  @Output() selected = new EventEmitter<GraphRange[] | undefined>();

  @Output() zoomButtonPosition = new EventEmitter<{x: number, y: number} | undefined>();

  chartOptions?: C.ChartConfiguration<'line'>['options'];
  chartData?: C.ChartData<'line', (number | C.Point | null)[]>;
  chartPlugins: C.Plugin<'line', any>[] = [];
  width?: number;
  height?: number;
  id = IdGenerator.generateId();
  positionPlugin = new PositionPlugin();

  @ViewChild('canvas', {read: BaseChartDirective}) canvas?: BaseChartDirective;

  constructor(
    injector: Injector,
    browser: BrowserService,
    private readonly i18n: I18nService,
    private readonly preferencesService: PreferencesService,
    changeDetector: ChangeDetectorRef,
  ) {
    super(injector);
    changeDetector.detach();
    this.whenVisible.subscribe(browser.resize$.pipe(debounceTime(300)), () => {
      if (this.width && this.height && this.width === this.canvas?.chart?.canvas?.parentElement?.clientWidth && this.height === this.canvas?.chart?.canvas?.parentElement?.clientHeight)
        return;
      this.resetChart();
    });
    this.visible$.subscribe(() => this.resetChart());
    this.whenVisible.subscribe(preferencesService.preferences$, () => {
      this.backgroundColor = '';
      this.resetChart();
    });
    injector.get(ElementRef).nativeElement.addEventListener('mouseout', () => this.pointHover.emit([]));
  }

  protected override getComponentState() {
    return {
      track1: this.track1,
      track2: this.track2,
      selectable: this.selectable,
      graphType: this.graphType,
    }
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.resetChart();
  }

  protected override onChangesBeforeCheckComponentState(changes: SimpleChanges): void {
    if (changes['selection']) {
      if (this.chartOptions !== undefined)
        this.setSelection(changes['selection'].currentValue);
    }
  }

  public updateRecording(track: Track, segmentIndexInTrack1?: number, pointIndexInTrack1?: number): void {
    this.ngZone.runOutsideAngular(() => {
      // when updating a recording track, the latest point may be updated, and new points may appeared
      if (!this.chartData) return;
      const datasetIndex = track === this.track1 ? 0 : track === this.track2 ? 1 : -1;
      if (datasetIndex < 0) return;
      const ds = this.chartData.datasets[datasetIndex];
      if (datasetIndex === 1) {
        this.positionPlugin.segmentIndex = segmentIndexInTrack1;
        this.positionPlugin.pointIndex = pointIndexInTrack1;
      } else {
        this.positionPlugin.segmentIndex = undefined;
        this.positionPlugin.pointIndex = undefined;
      }
      this.updateRecordingData(ds, track);
    });
  }

  public resetChart(): void {
    this.ngZone.runOutsideAngular(() => {
      this.chartOptions = undefined;
      this.chartData = undefined;
      this.chartPlugins = [];
      this.width = undefined;
      this.height = undefined;
      this.selectionRange = this.selection || [];
      if (this._visibilityObserver) {
        this._visibilityObserver.disconnect();
        this._visibilityObserver = undefined;
      }
      if (this._visibilityTimeout) {
        clearTimeout(this._visibilityTimeout);
        this._visibilityTimeout = undefined;
      }
      const container = document.getElementById('graph-tooltip-' + this.id);
      if (container)
        container.style.display = 'none';
      if (!this.initializing) this.changesDetection.detectChanges();
      if (!this.track1) return;
      if (this.visible)
        this._visibilityTimeout = setTimeout(() => this.waitForVisible(), 0);
    });
  }

  private _visibilityObserver?: IntersectionObserver;
  private _visibilityTimeout?: any;
  private waitForVisible(): void {
    this._visibilityTimeout = undefined;
    this._visibilityObserver = new IntersectionObserver(entries => {
      if (!this._visibilityObserver) return;
      if (entries[0].isIntersecting) {
        const w = entries[0].boundingClientRect.width;
        const h = entries[0].boundingClientRect.height;
        this._visibilityObserver.disconnect();
        this._visibilityObserver = undefined;
        if (w > 100 && h > 100) {
          this.startChart(w, h, entries[0].target as HTMLElement);
        } else {
          this._visibilityTimeout = setTimeout(() => this.waitForVisible(), 250);
        }
      }
    });
    this._visibilityObserver.observe(this.injector.get(ElementRef).nativeElement);
  }

  private backgroundColor = '';
  private contrastColor = '';
  private primaryColor = '';
  private secondaryColor = '';
  private selectingColor = '';
  private selectionColor = '';
  private singleSelectionColor = '';

  private startChart(width: number, height: number, element: HTMLElement): void {
    if (!this.visible || !this.track1) return;
    this.width = width;
    this.height = height;
    if (this.backgroundColor === '') {
      const styles = getComputedStyle(element);
      this.backgroundColor = String(styles.getPropertyValue('--ion-background-color')).trim();
      this.contrastColor = String(styles.getPropertyValue('--ion-text-color')).trim();
      this.primaryColor = String(styles.getPropertyValue('--graph-primary-color')).trim();
      this.secondaryColor = String(styles.getPropertyValue('--graph-secondary-color')).trim();
      this.selectingColor = String(styles.getPropertyValue('--graph-selecting-color')).trim();
      this.selectionColor = String(styles.getPropertyValue('--graph-selection-color')).trim();
      this.singleSelectionColor = String(styles.getPropertyValue('--graph-single-selection-color')).trim();
    }
    this.createChart();
  }

  private selectionRange: RangeReference[] | PointReference[] = [];

  public setSelection(ranges: RangeReference[] | PointReference[] | undefined): void {
    const plugin = this.chartPlugins.find(p => p instanceof RangeSelection);
    if (plugin) {
      const selection = ranges ? this.selectionToRangeSelection(ranges) : undefined;
      this.selectionRange = [];
      plugin.setSelection(selection);
      this.canvas?.chart?.draw();
    } else {
      this.selectionRange = ranges ?? [];
    }
  }

  private isSelecting = false;

  private createChart(): void {
    this.ngZone.runOutsideAngular(() => {
      if (!this.chartOptions) this.buildOptions();
      if (this.chartPlugins.length === 0)
        this.chartPlugins.push(
          new HoverVerticalLine(this.contrastColor),
          new BackgroundPlugin(this.backgroundColor),
          new RangeSelection(
            this.selectingColor, this.selectionColor, this.singleSelectionColor,
            event => {
              this.isSelecting = event !== undefined;
              this.selecting.emit(this.rangeSelectionToEvent(event))
            },
            event => this.selected.emit(this.rangeSelectionToEvent(event)),
            () => this.selectable,
            (pos) => this.zoomButtonPosition.emit(pos),
          ),
          this.positionPlugin
        );

      this.chartData = {
        datasets: []
      }
      if (this.track1 && this.track2) {
        this.buildDataSet(this.track1, this.primaryColor, 0.33, false, false);
        this.buildDataSet(this.track2, this.secondaryColor, 1, false, false);
      } else if (this.track1) {
        this.buildDataSet(this.track1, this.primaryColor, 1, this.graphType === 'elevation', this.graphType === 'speed');
        if (this.graphType === 'elevation') {
          if (!this.chartPlugins.find(p => p instanceof ElevationLegendPlugin))
            this.chartPlugins.push(new ElevationLegendPlugin(this.gradeColors, this.gradeLegend));
        } else if (this.graphType === 'speed') {
          if (!this.chartPlugins.find(p => p instanceof SpeedLegendPlugin))
            this.chartPlugins.push(new SpeedLegendPlugin(SPEED_ESTIMATION_COLOR, this.contrastColor, this.i18n.texts.trailGraph.legend_estimated_speed));
        }
      }
      this.updateMinMaxAxis(false);
      this.changesDetection.detectChanges(() => {
        if (this.selectionRange) {
          setTimeout(() => {
            this.setSelection(this.selectionRange);
          }, 0);
        }
      });
    });
  }

  private updateMinMaxAxis(updateCurrent: boolean): void {
    let maxX = 0;
    let minY = undefined;
    let maxY = undefined;
    for (const ds of this.chartData!.datasets) {
      const pts = ds.data as any[];
      if ((ds as any).isGrade || pts.length === 0) continue;
      maxX = Math.max(maxX, pts[pts.length - 1].x);
      let start = 0;
      if (minY === undefined) {
        minY = pts[0].y;
        maxY = minY;
        start = 1;
      }
      for (let i = start; i < pts.length; ++i) {
        minY = Math.min(minY, pts[i].y);
        maxY = Math.max(maxY, pts[i].y);
      }
    }
    minY = Math.floor(minY);
    maxY = maxY === Math.floor(maxY) ? maxY : Math.floor(maxY) + 1;
    this.chartOptions!.scales!['x']!.max = maxX;
    this.chartOptions!.scales!['y']!.min = minY;
    this.chartOptions!.scales!['y']!.max = maxY;
    if (updateCurrent) {
      this.canvas!.chart!.options.scales!['x']!.max = this.chartOptions!.scales!['x']!.max;
      this.canvas!.chart!.options.scales!['y']!.min = this.chartOptions!.scales!['y']!.min;
      this.canvas!.chart!.options.scales!['y']!.max = this.chartOptions!.scales!['y']!.max;
    }
  }

  private buildOptions(): void {
    this.chartOptions = {
      responsive: false,
      backgroundColor: this.backgroundColor,
      color: this.contrastColor,
      animation: false,
      normalized: true,
      spanGaps: false,
      maintainAspectRatio: false,
      elements: {
        point: {
          radius: 0,
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: 0,
          title: {
            text: this.graphType === 'elevation' ?
              this.i18n.texts.trailGraph.distance + ' (' + this.i18n.shortUserElevationGraphDistanceUnit() + ')' :
              this.i18n.texts.trailGraph.time_duration,
            display: true,
            color: this.contrastColor,
            padding: { top: -5, bottom: 0, y: 0 },
            align: 'start'
          },
          grid: {
            color: new Color(this.contrastColor).setAlpha(0.33).toString()
          },
          border: {
            color: this.contrastColor,
          },
          ticks: {
            color: this.contrastColor,
            callback: this.graphType === 'elevation' ?
              value => (typeof value === 'number' ? value : parseInt(value ?? '0')).toLocaleString(this.preferencesService.preferences.lang, {maximumFractionDigits: 2}) :
              value => this.i18n.durationToString(typeof value === 'number' ? value : parseInt(value ?? '0'), true, false),
          }
        },
        y: {
          type: 'linear',
          min: 0,
          max: 0,
          title: {
            text: this.i18n.texts.trailGraph[this.graphType] + ' (' + (this.graphType === 'elevation' ? this.i18n.shortUserElevationUnit() : this.i18n.shortUserSpeedUnit()) + ')',
            display: true,
            color: this.contrastColor,
            padding: { top: 0, bottom: 0, y: 0 },
          },
          grid: {
            color: new Color(this.contrastColor).setAlpha(0.33).toString(),
          },
          border: {
            color: this.contrastColor
          },
          ticks: {
            color: this.contrastColor,
          },
        }
      },
      interaction: {
        mode: 'myCustomMode',
        intersect: false,
      },
      plugins: {
        filler: {
        },
        decimation: {
          enabled: true,
          algorithm: 'lttb',
        },
        tooltip: {
          enabled: false,
          external: (context: any) => {
            const container = document.getElementById('graph-tooltip-' + this.id);
            if (!container) return;
            if (context.tooltip.opacity === 0) {
              container.style.display = 'none';
              return;
            }
            const points: any[] = context.tooltip.dataPoints.filter((p: any) => p.raw.lat !== undefined);
            if (points.length === 0 || this.isSelecting) {
              container.style.display = 'none';
              return;
            }
            container.style.display = 'block';
            let html = '<table>';
            if (points.length > 1) {
              html += '<tr class="header"><th></th>';
              for (const point of points) {
                html += '<th><div style="width: 25px; height: 0; display: inline-block; border-bottom: 2px solid ' + point.dataset.strokeColor + ';"></div></th>';
              }
              html += '</tr>';
            }
            const addInfo = (title: string, text: (pt: any) => string) => {
              let hasValue = false;
              for (const point of points) {
                const v = text(point);
                if (v && v.length > 0) {
                  hasValue = true;
                  break;
                }
              }
              if (!hasValue) return;
              html += '<tr><th>' + title + '</th>';
              for (const point of points) html += '<td>' + text(point) + '</td>';
              html += '</tr>';
            };
            addInfo(this.i18n.texts.trailGraph.elevation, pt => {
              let s = this.i18n.elevationToString(pt.raw.ele);
              if (pt.raw.eleAccuracy !== undefined) {
                s += ' (± ' + this.i18n.elevationToString(pt.raw.eleAccuracy) + ')';
              }
              return s;
            });
            addInfo(this.i18n.texts.trailGraph.elevation_grade, pt => {
              let s = '';
              if (pt.raw.grade.gradeBefore !== undefined) s = Math.floor(pt.raw.grade.gradeBefore * 100) + '%';
              if (pt.raw.grade.gradeAfter !== undefined) {
                if (s.length > 0) s += ' / ';
                s += Math.floor(pt.raw.grade.gradeAfter * 100) + '%';
              }
              return s;
            });
            addInfo(this.i18n.texts.trailGraph.distance, pt => this.i18n.distanceToString(pt.raw.distanceMeters));
            addInfo(this.i18n.texts.trailGraph.time_duration, pt => this.i18n.durationToString(pt.raw.timeSinceStart));
            addInfo(this.i18n.texts.trailGraph.speed, pt => {
              const s1 = pt.raw.speedInMeters ? this.i18n.getSpeedStringInUserUnit(pt.raw.speedInMeters) : '';
              const s2 = pt.raw.estimatedSpeed ? this.i18n.getSpeedStringInUserUnit(pt.raw.estimatedSpeed) : '';
              if (s1.length === 0) {
                if (s2.length === 0) return '';
                return '≈ ' + s2;
              } else {
                if (s2.length === 0) return s1;
                return s1 + ' (≈ ' + s2 + ')';
              }
            });
            html += '<tr><th>' + this.i18n.texts.trailGraph.location + '</th>';
            for (const point of points) {
              html += '<td>';
              html += this.i18n.coordToString(point.raw.lat) + '<br/>' + this.i18n.coordToString(point.raw.lng)
              if (point.raw.posAccuracy !== undefined) {
                html += ' (± ' + this.i18n.distanceToString(point.raw.posAccuracy) + ')';
              }
              html += '</td>';
            }
            html += '</tr>';
            html += '</table>';
            container.innerHTML = html;
            const chartRect = context.chart.canvas.getBoundingClientRect();
            if (context.tooltip._eventPosition.x < chartRect.width / 2) {
              container.style.left = (context.tooltip._eventPosition.x + 15) + 'px';
              container.style.right = '';
            } else {
              container.style.right = (chartRect.width - context.tooltip._eventPosition.x + 15) + 'px';
              container.style.left = '';
            }
            /*
            if (context.tooltip._eventPosition.y < chartRect.height * 0.3) {
              container.style.top = (context.tooltip._eventPosition.y + 5) + 'px';
              container.style.bottom = '';
            } else {
              container.style.bottom = (chartRect.height - context.tooltip._eventPosition.y + 5) + 'px';
              container.style.top = '';
            }*/
           container.style.top = '5px';
           container.style.bottom = '';
          }
        }
      },
      events: ['mousemove', 'mouseout', 'click', 'mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend'],
      onHover: (event:any, elements: C.ActiveElement[], chart: any) => {
        const references = this.canvas!.chart!.getActiveElements().map(element => {
          if ((this.chartData!.datasets[element.datasetIndex] as any).isNotData) return null;
          if ((element.element as any).$context) // NOSONAR
            return this.activeElementToPointReference(element);
          return null;
        }).filter(r => !!r);
        if (references.length === 0 && event.native.detail === -1) return;
        this.pointHover.emit(references);
      },
      onClick: (event:any, elements: C.ActiveElement[], chart: any) => {
        if (event.type !== 'click') return;
        const references = this.canvas!.chart!.getActiveElements().map(element => {
          if ((this.chartData!.datasets[element.datasetIndex] as any).isNotData) return null;
          if ((element.element as any).$context) // NOSONAR
            return this.activeElementToPointReference(element);
          return null;
        }).filter(r => !!r);
        if (references.length === 0 && event.native.detail === -1) return;
        this.pointClick.emit(references);
      },
    };
  }

  private buildDataSet(track: Track, colorBase: string, lineAlpha: number, withGradeFilling: boolean, withSpeedEstimation: boolean) {
    const color = new Color(colorBase).setAlpha(lineAlpha).toString();
    const ds = {
      borderColor: color,
      pointColor: color,
      strokeColor: color,
      pointStyle: false,
      parsing: false,
      tension: 0.02,
      data: []
    } as any;
    this.fillDataSet(ds, track);
    if (withGradeFilling) {
      this.chartData!.datasets.push(ds);
      this.chartData!.datasets.push(...this.buildGradeDatasets(ds));
    } else {
      ds.fill = 'origin';
      ds.backgroundColor = new Color(colorBase).setAlpha(0.2).toString();
      ds.fillColor = color;
      this.chartData!.datasets.push(ds);
      if (withSpeedEstimation) {
        this.chartData!.datasets.push(this.buildSpeedEstimationDataset(track, ds.data));
      }
    }
  }

  private fillDataSet(ds: any, track: Track): void {
    for (let segmentIndex = 0; segmentIndex < track.segments.length; segmentIndex++) {
      const points = track.segments[segmentIndex].points;
      for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
        (ds.data as any[]).push(...this.createDataPoints(ds.data.length === 0 ? undefined : ds.data[ds.data.length - 1], segmentIndex, pointIndex, track, points, ds.data, ds.data.length));
      }
    }
  }

  private buildGradeDatasets(originalDs: any): any[] { // NOSONAR
    const points = originalDs.data.filter((d: any) => d.ele !== undefined);
    if (points.length < 2) return [];
    const ds: any[] = [];
    let minY = originalDs.data[0].y;
    for (let i = 1; i < originalDs.data.length; ++i)
      minY = Math.min(minY, originalDs.data[i].y);

    let previousIndex = 0;
    let previousLevel: number | undefined = undefined;
    let distanceFromPrevious = 0;
    let totalGradeFromPrevious = 0;
    for (let i = 1; i < points.length; ++i) {
      const g = Math.abs(points[i].grade.gradeBefore as number);
      if (previousIndex === i - 1 && previousLevel === this.getGradeRange(g)) {
        // same level => add it to the current dataset
        this.addElevationGrade(ds, points, previousIndex, i, minY, previousLevel);
        previousIndex = i;
        continue;
      }
      const d = new L.LatLng(points[i].lat, points[i].lng).distanceTo(points[i - 1] as L.LatLngExpression);
      distanceFromPrevious += d;
      totalGradeFromPrevious += g * d;
      if (distanceFromPrevious === 0) continue;
      const level = this.getGradeRange(totalGradeFromPrevious / distanceFromPrevious);
      if (distanceFromPrevious > 25 || level === previousLevel) {
        previousLevel = this.addElevationGrade(ds, points, previousIndex, i, minY, level);
        previousIndex = i;
        distanceFromPrevious = 0;
        totalGradeFromPrevious = 0;
      }
    }
    if (distanceFromPrevious > 0)
      this.addElevationGrade(ds, points, previousIndex, points.length - 1, minY, this.getGradeRange(totalGradeFromPrevious / distanceFromPrevious));
    return ds;
  }

  private addElevationGrade(ds: any[], points: any[], startIndex: number, endIndex: number, minY: number, level: number): number {
    const color = this.gradeColors[level] + 'A0';
    if (ds.length === 0 || ds[ds.length - 1].backgroundColor !== color) {
      ds.push({
        isGrade: true,
        isNotData: true,
        backgroundColor: color,
        borderColor: color,
        pointColor: color,
        strokeColor: color,
        borderWidth: 0,
        showLine: false,
        spanGaps: false,
        fill: 0,
        radius: 0,
        pointStyle: false,
        parsing: false,
        data: [{
          x: points[startIndex].x,
          y: minY,
        }]
      });
    }
    for (let i = startIndex + 1; i <= endIndex; ++i)
      ds[ds.length - 1].data.push({
        x: points[i].x,
        y: minY,
      });
    return level;
  }

  private readonly gradeColors = [
    '#D8D8D8', // 5%-
    '#FFD890', // 7% to 5%
    '#F0A040', // 10% to 7%
    '#C05016', // 15% to 10%
    '#700000' // 15%+
  ];
  private readonly gradeLegend = [
    '± 5%',
    '> 5%',
    '> 7%',
    '> 10%',
    '> 15%'
  ];
  private getGradeRange(grade: number): number {
    if (grade <= 0.05) return 0;
    if (grade <= 0.07) return 1;
    if (grade <= 0.1) return 2;
    if (grade <= 0.15) return 3;
    return 4;
  }

  private updateRecordingData(ds: any, track: Track): void { // NOSONAR
    if (!this.canvas?.chart) return;
    let pointCount = 0;
    for (let segmentIndex = 0; segmentIndex < track.segments.length; segmentIndex++) {
      const points = track.segments[segmentIndex].points;
      for (let pointIndex = 0; pointIndex < points.length; ++pointIndex) {
        const dataPoints = this.createDataPoints(pointCount === 0 ? undefined : ds.data[pointCount - 1], segmentIndex, pointIndex, track, points, ds.data, pointCount);
        if (pointCount < ds.data.length) {
          // existing => update
          let nb = 1;
          for (; pointCount + nb < ds.data.length && ds.data[pointCount + nb].pointIndex === pointIndex && ds.data[pointCount + nb].segmentIndex === segmentIndex; ++nb);
          ds.data.splice(pointCount, nb, ...dataPoints);
        } else {
          // new points
          ds.data.push(...this.createDataPoints(pointCount === 0 ? undefined : ds.data[pointCount - 1], segmentIndex, pointIndex, track, points, ds.data, ds.data.length));
        }
        pointCount += dataPoints.length;
      }
    }
    if (pointCount < ds.data.length) {
      ds.data.splice(pointCount, ds.data.length - pointCount);
    }
    this.updateMinMaxAxis(true);
    this.canvas?.chart?.update('none');
  }

  public updateTrack(track: Track): void {
    this.ngZone.runOutsideAngular(() => {
      if (!this.chartData) return;
      const datasetIndex = track === this.track1 ? 0 : track === this.track2 ? 1 : -1;
      if (datasetIndex < 0) return;
      const ds = this.chartData.datasets[datasetIndex];
      ds.data = [];
      this.fillDataSet(ds, track);
      if (this.chartPlugins.find(p => p instanceof ElevationLegendPlugin)) {
        for (let i = 0; i < this.chartData.datasets.length; ++i) {
          if ((this.chartData.datasets[i] as any).isGrade) {
            this.chartData.datasets.splice(i, 1);
            i--;
          }
        }
        this.chartData.datasets.push(...this.buildGradeDatasets(ds));
      }
      this.updateMinMaxAxis(true);
      this.canvas?.chart?.update();
    });
  }

  private buildSpeedEstimationDataset(track: Track, originalData: DataPoint[]): any {
    const color = SPEED_ESTIMATION_COLOR;
    const ds = {
      isSpeedEstimation: true,
      isNotData: true,
      borderColor: color,
      pointColor: color,
      strokeColor: color,
      pointStyle: false,
      parsing: false,
      tension: 0.02,
      data: []
    } as any;
    const prefs = this.preferencesService.preferences;
    let distance = 0;
    let duration = 0;
    let estimatedDuration = 0;
    let durationSincePreviousBreak = 0;
    let index = 0;
    const trackDistance = track.metadata.distance;
    const segments = track.segments;
    for (const segment of segments) {
      const points = segment.points;
      durationSincePreviousBreak = 0;
      const segmentDuration = segment.duration;
      let durationSinceSegmentStart = 0;
      for (const point of points) {
        const distanceFromPreviousPoint = point.distanceFromPreviousPoint;
        distance += distanceFromPreviousPoint;
        const speed = distanceFromPreviousPoint > 0 ? estimateSpeedInMetersByHour(point, estimatedDuration, prefs.estimatedBaseSpeed) : ds.data.length === 0 ? 0 : ds.data[ds.data.length - 1].speed;
        const estimatedTime = speed > 0 ? distanceFromPreviousPoint * (60 * 60 * 1000) / speed : 0;
        estimatedDuration += estimatedTime;
        let timeFromPreviousPoint = point.durationFromPreviousPoint ?? estimatedTime;
        duration += timeFromPreviousPoint;
        durationSincePreviousBreak += timeFromPreviousPoint;
        durationSinceSegmentStart += timeFromPreviousPoint;
        while (originalData[index].isBreakPoint) {
          ds.data.push({
            isBreakPoint: true,
            x: originalData[index].x,
            y: null,
          });
          index++;
        }
        ds.data.push({
          x: duration,
          y: this.i18n.distanceInLongUserUnit(speed),
          distance,
          duration,
          speed,
          distanceFromPreviousPoint,
          timeFromPreviousPoint,
          originalDataIndex: index,
        });
        originalData[index].estimatedSpeed = speed;
        if (originalData[index].x === 0) originalData[index].x = duration;
        index++;
        if (durationSincePreviousBreak >= ESTIMATED_SMALL_BREAK_EVERY &&
          distanceFromPreviousPoint > 0 &&
          (!segmentDuration || segmentDuration - durationSinceSegmentStart > ESTIMATED_SMALL_BREAK_EVERY / 2) && // no break if less than 30 minutes remaining
          (segmentDuration || (trackDistance > 0 && trackDistance - distance > prefs.estimatedBaseSpeed * 0.4)) // no break if no time info and remaining distance is around 30 minutes
        ) {
          const breakTime = estimateSmallBreakTime(duration);
          let t = 0;
          for (let i = ds.data.length - 1; i >= 0 && i >= ds.data.length - 100; --i) {
            if (ds.data[i].timeFromPreviousPoint === undefined) continue;
            t += ds.data[i].timeFromPreviousPoint;
            if (t <= breakTime) {
              ds.data[i].speed = 0;
              ds.data[i].y = 0;
              originalData[ds.data[i].originalDataIndex].estimatedSpeed = 0;
            } else {
              const tDelta = 1 - (t - breakTime) / ds.data[i].timeFromPreviousPoint;
              ds.data[i].speed *= tDelta;
              ds.data[i].y *= tDelta;
              originalData[ds.data[i].originalDataIndex].estimatedSpeed = ds.data[i].speed;
              break;
            }
          }
          estimatedDuration += breakTime;
          durationSincePreviousBreak = 0;
        }
      }
    }
    // 2. split data by section of at least 10 points and 1 minute
    let startIndex = 0;
    let previousMiddle = -1;
    let previousMiddleRemainingDistance = 0;
    let previousAverageSpeed = 0;
    while (startIndex < ds.data.length) {
      if (ds.data[startIndex].speed === 0) {
        startIndex++;
        previousMiddle = -1;
        continue;
      }
      let sectionDistance = 0;
      let sectionTime = 0;
      let sectionSpeed = 0;
      let endIndex = startIndex + 1;
      for (; endIndex < ds.data.length; ++endIndex) {
        if (ds.data[endIndex].speed === 0) {
          endIndex--;
          break;
        }
        if (ds.data[endIndex].isBreakPoint) continue;
        sectionDistance += ds.data[endIndex].distanceFromPreviousPoint;
        sectionTime += ds.data[endIndex].timeFromPreviousPoint;
        sectionSpeed += ds.data[endIndex].speed * ds.data[endIndex].distanceFromPreviousPoint;
        if (endIndex - startIndex >= 10 && sectionTime >= 60 * 1000) {
          break;
        }
      }
      if (endIndex === startIndex) {
        startIndex++;
        previousMiddle = -1;
        continue;
      }
      const averageSpeed = sectionSpeed / sectionDistance;
      let middleIndex = startIndex;
      let middleDistance = 0;
      while (middleIndex < endIndex && middleDistance < sectionDistance / 2) {
        middleIndex++;
        if (ds.data[middleIndex].isBreakPoint) continue;
        middleDistance += ds.data[middleIndex].distanceFromPreviousPoint;
      }
      if (previousMiddle === -1) {
        let d = 0;
        for (let i = startIndex; i <= middleIndex && i < ds.data.length; ++i) {
          if (ds.data[i].isBreakPoint) continue;
          d += ds.data[i].distanceFromPreviousPoint;
          const x = d / middleDistance;
          const easeInOut = -(Math.cos(Math.PI * x) - 1) / 2;
          const speed = averageSpeed * easeInOut;
          ds.data[i].y = this.i18n.distanceInLongUserUnit(speed);
          ds.data[i].speed = speed;
          originalData[ds.data[i].originalDataIndex].estimatedSpeed = speed;
        }
      } else {
        let d = 0;
        for (let i = previousMiddle + 1; i <= middleIndex; ++i) {
          if (ds.data[i].isBreakPoint) continue;
          d += ds.data[i].distanceFromPreviousPoint;
          const x = d / (previousMiddleRemainingDistance + middleDistance);
          const easeInOut = -(Math.cos(Math.PI * x) - 1) / 2;
          const speed = previousAverageSpeed + (averageSpeed - previousAverageSpeed) * easeInOut;
          ds.data[i].y = this.i18n.distanceInLongUserUnit(speed);
          ds.data[i].speed = speed;
          originalData[ds.data[i].originalDataIndex].estimatedSpeed = speed;
        }
      }
      startIndex = endIndex + 1;
      previousMiddle = middleIndex;
      previousMiddleRemainingDistance = sectionDistance - middleDistance;
      previousAverageSpeed = averageSpeed;
    }
    // finally fill the end
    for (let i = previousMiddle + 1; i < ds.data.length; ++i) {
      if (ds.data[i].isBreakPoint) continue;
      ds.data[i].y = this.i18n.distanceInLongUserUnit(previousAverageSpeed);
    }
    return ds;
  }

  private createDataPoints(previous: DataPoint | undefined, trackSegmentIndex: number, trackPointIndex: number, track: Track, points: Point[], dataPoints: DataPoint[], dataIndex: number): DataPoint[] {
    const point = points[trackPointIndex];

    let distance = previous?.distanceMeters ?? 0;
    if (trackPointIndex > 0) distance += point.distanceFromPreviousPoint;

    let timeSinceStart = undefined;
    if (previous?.timeSinceStart && previous.time && point.time)
      timeSinceStart = previous.timeSinceStart + (point.time - previous.time);
    else if (point.time) {
      const start = track.startDate;
      if (start) timeSinceStart = point.time - start;
    }

    const isBreak = trackPointIndex > 0 && point.durationFromPreviousPoint && point.durationFromPreviousPoint > 60 * 1000;

    let distanceSinceLastSpeed = (previous?.distanceSinceLastSpeed ?? 0) + (trackPointIndex > 0 ? point.distanceFromPreviousPoint : 0);
    let timeSinceLastSpeed = (previous?.timeSinceLastSpeed ?? 0) + (trackPointIndex > 0 && point.durationFromPreviousPoint ? point.durationFromPreviousPoint : 0);
    let speedInMeters = previous?.speedInMeters ?? 0;
    if (timeSinceLastSpeed >= 60 * 1000 || (timeSinceLastSpeed > 2000 && (distanceSinceLastSpeed * (60 * 60 * 1000) / timeSinceLastSpeed) < 100)) {
      speedInMeters = distanceSinceLastSpeed * (60 * 60 * 1000) / timeSinceLastSpeed;
      for (let start = dataIndex - 1; start >= 0; --start) {
        if (dataPoints[start].timeSinceLastSpeed === 0) {
          const startSpeed = dataPoints[start].speedInMeters;
          for (let i = start + 1; i < dataIndex; ++i) {
            if (dataPoints[i].distanceSinceLastSpeed > 0) {
              const x = dataPoints[i].distanceSinceLastSpeed / distanceSinceLastSpeed;
              const easeInOut = -(Math.cos(Math.PI * x) - 1) / 2
              dataPoints[i].speedInMeters = startSpeed + (speedInMeters - startSpeed) * easeInOut;
              if (this.graphType === 'speed')
                dataPoints[i].y = this.i18n.distanceInLongUserUnit(dataPoints[i].speedInMeters);
            }
          }
          break;
        }
      }
      distanceSinceLastSpeed = 0;
      timeSinceLastSpeed = 0;
    }

    const dataPoint: DataPoint = {
      x: this.graphType === 'elevation' ?
           this.i18n.elevationGraphDistanceValue(this.i18n.distanceInUserUnit(distance)) :
           timeSinceStart ?? 0,
      y: this.graphType === 'elevation' ?
          (point.ele !== undefined ? this.i18n.elevationInUserUnit(point.ele) : null) :
          this.i18n.distanceInLongUserUnit(speedInMeters),
      segmentIndex: trackSegmentIndex,
      pointIndex: trackPointIndex,
      time: point.time,
      timeSinceStart,
      timeSinceLastSpeed,
      lat: point.pos.lat,
      lng: point.pos.lng,
      ele: point.ele,
      distanceMeters: distance,
      distanceFromPrevious: point.distanceFromPreviousPoint,
      distanceSinceLastSpeed,
      grade: TrackUtils.elevationGrade(points, trackPointIndex),
      eleAccuracy: point.eleAccuracy,
      posAccuracy: point.posAccuracy,
      speedInMeters,
    };
    if (isBreak && this.graphType === 'speed') {
      // insert points with speed 0
      const previous = dataPoints[dataIndex - 1];
      return [
        {
          x: previous.x + 1,
          y: 0,
          segmentIndex: trackSegmentIndex,
          pointIndex: trackPointIndex,
          time: previous.x + 1,
          timeSinceStart: previous.timeSinceStart ? previous.timeSinceStart + 1 : undefined,
          timeSinceLastSpeed: previous.timeSinceLastSpeed + 1,
          lat: previous.lat,
          lng: previous.lng,
          ele: previous.ele,
          distanceMeters: previous.distanceMeters,
          distanceFromPrevious: 0,
          distanceSinceLastSpeed: previous.distanceSinceLastSpeed,
          grade: { gradeBefore: undefined, gradeAfter: undefined },
          eleAccuracy: previous.eleAccuracy,
          posAccuracy: previous.posAccuracy,
          speedInMeters: 0,
          isBreakPoint: true,
        }, {
          x: dataPoint.x - 1,
          y: 0,
          segmentIndex: trackSegmentIndex,
          pointIndex: trackPointIndex,
          time: dataPoint.x - 1,
          timeSinceStart: dataPoint.timeSinceStart,
          timeSinceLastSpeed: dataPoint.timeSinceLastSpeed,
          lat: dataPoint.lat,
          lng: dataPoint.lng,
          ele: dataPoint.ele,
          distanceMeters: dataPoint.distanceMeters,
          distanceFromPrevious: dataPoint.distanceFromPrevious,
          distanceSinceLastSpeed: dataPoint.distanceSinceLastSpeed,
          grade: { gradeBefore: undefined, gradeAfter: undefined },
          eleAccuracy: dataPoint.eleAccuracy,
          posAccuracy: dataPoint.posAccuracy,
          speedInMeters: 0,
          isBreakPoint: true,
        },
        { ...dataPoint,
          distanceFromPrevious: 0,
        }
      ]
    }
    return [dataPoint];
  }

  public showCursorForPosition(lat: number, lng: number): void {
    if (!this.canvas?.chart || !this.chartData) {
      return;
    }
    const elements: C.ActiveElement[] = [];
    for (let dsIndex = 0; dsIndex < this.chartData.datasets.length; dsIndex++) {
      const pointIndex = this.chartData.datasets[dsIndex].data.findIndex((pt: any) => pt.lat === lat && pt.lng === lng);
      if (pointIndex >= 0) {
        elements.push({element: this.canvas?.chart.getDatasetMeta(dsIndex).data[pointIndex], datasetIndex: dsIndex, index: pointIndex});
      }
    }
    this.updateElements(elements, elements.length === 0 ? undefined : elements[0].element);
  }

  public hideCursor(): void {
    this.updateElements([]);
  }

  private _updateElements?: {elements: C.ActiveElement[], position?: C.Point};
  private _updateElementsTimeout?: any;
  private updateElements(elements: C.ActiveElement[], position?: C.Point): void {
    this._updateElements = {elements, position};
    if (this._updateElementsTimeout) {
      return;
    }
    this.ngZone.runOutsideAngular(() => {
      this._updateElementsTimeout = setTimeout(() => {
        this._updateElementsTimeout = undefined;
        const value = this._updateElements;
        this.ngZone.runOutsideAngular(() => {
          if (!value || !this.canvas?.chart) return;
          if (value.elements.length === 0 && this.canvas.chart.getActiveElements().length === 0) return;
          this.canvas.chart.setActiveElements(value.elements);
          this.canvas.chart.tooltip!.setActiveElements(value.elements, value.position ?? {x: 0, y: 0});
          this.updateChart();
        });
      }, 10);
    });
  }

  private _updateChartTimeout?: any;
  private updateChart(): void {
    if (this._updateChartTimeout) return;
    this.ngZone.runOutsideAngular(() => {
      this._updateChartTimeout = setTimeout(() => {
        this._updateChartTimeout = undefined;
        this.canvas?.chart?.update();
      }, 25);
    });
  }

  private activeElementToPointReference(element: C.ActiveElement): GraphPointReference {
    const pt: DataPoint = (element.element as any).$context.raw;
    const e: C.PointElement = element.element as C.PointElement;
    return new GraphPointReference(
      element.datasetIndex === 0 ? this.track1 : this.track2!,
      pt.segmentIndex,
      pt.pointIndex,
      { lat: pt.lat, lng: pt.lng },
      pt.ele,
      pt.time,
      element.index,
      e.x,
      e.y,
    );
  }

  private rangeSelectionToEvent(event?: RangeSelectionEvent) {
    if (!event) {
      return undefined;
    }
    const events = [];
    for (const ds of event.datasets) {
      if ((this.chartData!.datasets[ds.datasetIndex] as any).isNotData) continue;
      events.push(new GraphRange(
        ds.datasetIndex === 0 ? this.track1 : this.track2!,
        this.activeElementToPointReference(ds.start),
        this.activeElementToPointReference(ds.end),
      ));
    }
    return events;
  };

  private selectionToRangeSelection(sel: RangeReference[] | PointReference[]): SelectedRange | undefined {
    if (sel.length === 0 || !this.canvas?.chart) return undefined;
    const chart = this.canvas.chart;
    const selection: SelectedRange = {
      startX: -1,
      startElements: [],
      endX: -1,
      endElements: [],
    };
    for (const selectionElement of sel) {
      const datasetIndex = selectionElement.track === this.track1 ? 0 : 1;
      if (selectionElement instanceof PointReference) {
        const e = this.pointReferenceToGraph(selectionElement, datasetIndex, chart, selection.startX);
        if (e) {
          selection.startX = e.x;
          selection.startElements?.push(e.element);
        }
      } else {
        const start = this.pointReferenceToGraph(selectionElement.start, datasetIndex, chart, selection.startX);
        const end = this.pointReferenceToGraph(selectionElement.end, datasetIndex, chart, selection.endX);
        if (start) {
          selection.startX = start.x;
          selection.startElements?.push(start.element);
        }
        if (end) {
          selection.endX = end.x;
          selection.endElements?.push(end.element);
        }
      }
    }
    return selection;
  }

  private pointReferenceToGraph(point: PointReference, datasetIndex: number, chart: C.Chart, x: number): { x: number, element: C.ActiveElement} | undefined {
    const index = this.chartData!.datasets[datasetIndex].data.findIndex(d => (d as DataPoint).segmentIndex === point.segmentIndex && (d as DataPoint).pointIndex === point.pointIndex);
    if (index < 0) return undefined;
    const data = this.chartData!.datasets[datasetIndex].data[index] as DataPoint;
    const resultX = x === -1 ? chart.scales['x'].getPixelForValue(data.x) : x;
    const element = new C.PointElement(chart.getDatasetMeta(datasetIndex).data[index]);
    (element as any).$context = { raw: data };
    const resultElement: C.ActiveElement = {
      datasetIndex: datasetIndex,
      index: index,
      element: element,
    };
    return {x: resultX, element: resultElement};
  }

}

declare module 'chart.js' {
  interface InteractionModeMap {
    myCustomMode: C.InteractionModeFunction;
  }
}

C.Interaction.modes.myCustomMode = function(chart, event, options, useFinalPosition) {
  const position = getRelativePosition(event, chart as any); // NOSONAR
  const items: C.InteractionItem[] = [];
  C.Interaction.evaluateInteractionItems(chart, 'x', position, (element, datasetIndex, index) => {
    const sameDataset = items.findIndex(e => e.datasetIndex === datasetIndex);
    if (sameDataset < 0) {
      items.push({element, datasetIndex, index});
    } else if (Math.abs(position.x - items[sameDataset].element.x) > Math.abs(position.x - element.x)) {
      items[sameDataset] = {element, datasetIndex, index};
    }
  });
  return items;
}
