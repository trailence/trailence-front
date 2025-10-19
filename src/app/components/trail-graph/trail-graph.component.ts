import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Injector, Input, Output, SimpleChanges, ViewChild } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { Track } from 'src/app/model/track';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import * as C from 'chart.js';
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
import { SpeedLegendPlugin } from './plugins/speed-legend';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { debounceTime } from 'rxjs';
import { PositionPlugin } from './plugins/position';
import { NgStyle } from '@angular/common';
import { buildTooltip } from './tooltip-builder';
import { GradeDatasetBuilder } from './grade-dataset-builder';
import { DataPoint } from './data-point';
import { EstimatedSpeedDatasetBuilder } from './estimated-speed-dataset-builder';

C.Chart.register(C.LinearScale, C.LineController, C.PointElement, C.LineElement, C.Filler, C.Tooltip);

export type GraphType = 'elevation' | 'speed';

@Component({
  selector: 'app-trail-graph',
  templateUrl: './trail-graph.component.html',
  styleUrls: ['./trail-graph.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BaseChartDirective,
    NgStyle,
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
          if (!this.chartPlugins.some(p => p instanceof ElevationLegendPlugin))
            this.chartPlugins.push(new ElevationLegendPlugin(GradeDatasetBuilder.gradeColors, GradeDatasetBuilder.gradeLegend));
        } else if (this.graphType === 'speed') {
          if (!this.chartPlugins.some(p => p instanceof SpeedLegendPlugin))
            this.chartPlugins.push(new SpeedLegendPlugin(EstimatedSpeedDatasetBuilder.SPEED_ESTIMATION_COLOR, this.contrastColor, this.i18n.texts.trailGraph.legend_estimated_speed));
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
      maxX = Math.max(maxX, pts.at(-1).x);
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
              value => (typeof value === 'number' ? value : Number.parseInt(value ?? '0')).toLocaleString(this.preferencesService.preferences.lang, {maximumFractionDigits: 2}) :
              value => this.i18n.durationToString(typeof value === 'number' ? value : Number.parseInt(value ?? '0'), true, false),
              count: this.width ? Math.max(4, Math.floor(this.width / 100) + 2) : undefined,
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
            buildTooltip(context, container, this.isSelecting, this.i18n);
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
      this.chartData!.datasets.push(...GradeDatasetBuilder.buildGradeDatasets(ds));
    } else {
      ds.fill = 'origin';
      ds.backgroundColor = new Color(colorBase).setAlpha(0.2).toString();
      ds.fillColor = color;
      this.chartData!.datasets.push(ds);
      if (withSpeedEstimation) {
        this.chartData!.datasets.push(EstimatedSpeedDatasetBuilder.buildSpeedEstimationDataset(track, ds.data, this.preferencesService.preferences, this.i18n));
      }
    }
  }

  private fillDataSet(ds: any, track: Track): void {
    for (let segmentIndex = 0; segmentIndex < track.segments.length; segmentIndex++) {
      const points = track.segments[segmentIndex].points;
      for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
        (ds.data as any[]).push(...this.createDataPoints(ds.data.at(-1), segmentIndex, pointIndex, track, points, ds.data, ds.data.length));
      }
    }
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
      if (this.chartPlugins.some(p => p instanceof ElevationLegendPlugin)) {
        for (let i = 0; i < this.chartData.datasets.length; ++i) {
          if ((this.chartData.datasets[i] as any).isGrade) {
            this.chartData.datasets.splice(i, 1);
            i--;
          }
        }
        this.chartData.datasets.push(...GradeDatasetBuilder.buildGradeDatasets(ds));
      }
      this.updateMinMaxAxis(true);
      this.canvas?.chart?.update();
    });
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
          (point.ele === undefined ? null : this.i18n.elevationInUserUnit(point.ele)) :
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

  private selectionToRangeSelection(sel: RangeReference[] | PointReference[]): SelectedRange | undefined { // NOSONAR
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
