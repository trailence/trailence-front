import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Injector, Input, Output, ViewChild } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { Track } from 'src/app/model/track';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { Platform } from '@ionic/angular';
import * as C from 'chart.js';
import { _DeepPartialObject } from 'chart.js/dist/types/utils';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { Color } from 'src/app/utils/color';
import { AnyObject } from 'chart.js/dist/types/basic';
import { HoverVerticalLine } from './plugins/hover-vertical-line';
import { ElevationGraphPointReference, ElevationGraphRange } from './elevation-graph-events';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { BackgroundPlugin } from './plugins/background';
import { RangeSelection, RangeSelectionEvent, SelectedRange } from './plugins/range-selection';
import { Point } from 'src/app/model/point';
import { PathRange } from '../trail/path-selection';

C.Chart.register(C.LinearScale, C.LineController, C.PointElement, C.LineElement, C.Filler, C.Tooltip);

export interface DataPoint {
  x: number;
  y: number | null;
  segmentIndex: number;
  pointIndex: number;
  time?: number;
  timeSinceStart?: number;
  lat: number;
  lng: number;
  ele?: number;
  distanceMeters: number;
}

@Component({
  selector: 'app-elevation-graph',
  templateUrl: './elevation-graph.component.html',
  styleUrls: ['./elevation-graph.component.scss'],
  standalone: true,
  imports:[
    CommonModule,
    BaseChartDirective
  ]
})
export class ElevationGraphComponent extends AbstractComponent {

  @Input() track1!: Track
  @Input() track2?: Track;
  @Input() selectable = false;

  @Output() pointHover = new EventEmitter<ElevationGraphPointReference[]>();

  @Output() selecting = new EventEmitter<ElevationGraphRange[] | undefined>();
  @Output() selected = new EventEmitter<ElevationGraphRange[] | undefined>();

  chartOptions?: _DeepPartialObject<C.CoreChartOptions<"line"> & C.ElementChartOptions<"line"> & C.PluginChartOptions<"line"> & C.DatasetChartOptions<"line"> & C.ScaleChartOptions<"line"> & C.LineControllerChartOptions>;
  chartData?: C.ChartData<"line", (number | C.Point | null)[]>;
  chartPlugins: C.Plugin<"line", AnyObject>[] = [];
  width?: number;
  height?: number;

  @ViewChild('canvas', {read: BaseChartDirective}) canvas?: BaseChartDirective;

  constructor(
    injector: Injector,
    platform: Platform,
    private i18n: I18nService,
    preferencesService: PreferencesService,
  ) {
    super(injector);
    this.whenVisible.subscribe(platform.resize, () => this.resizeChart());
    this.visible$.subscribe(() => this.resetChart());
    this.whenVisible.subscribe(preferencesService.preferences$, () => this.resetChart());
    injector.get(ElementRef).nativeElement.addEventListener('mouseout', () => this.pointHover.emit([]));
  }

  protected override getComponentState() {
    return {
      track1: this.track1,
      track2: this.track2,
      selectable: this.selectable,
    }
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.resetChart();
  }

  public updateRecording(track: Track): void {
    // when updating a recording track, the latest point may be updated, and new points may appeared
    if (!this.chartData) return;
    const datasetIndex = track === this.track1 ? 0 : track === this.track2 ? 1 : -1;
    if (datasetIndex < 0) return;
    const ds = this.chartData.datasets[datasetIndex];
    this.updateRecordingData(ds, track);
  }

  private checkSizeTimeout?: any;

  private resetChart(): void {
    this.chartOptions = undefined;
    this.chartData = undefined;
    this.chartPlugins = [];
    this.width = undefined;
    this.height = undefined;
    this.selectionRange = [];
    if (!this.track1) return;
    if (this.checkSizeTimeout) clearTimeout(this.checkSizeTimeout);
    if (this.visible)
      this.checkSizeTimeout = setTimeout(() => this.checkElementSizeThenCreateChart(), 25);
  }

  private resizeChart(): void {
    if (!this.chartOptions) return;
    if (!this.track1) return;
    if (this.checkSizeTimeout) clearTimeout(this.checkSizeTimeout);
    if (this.visible)
      this.checkSizeTimeout = setTimeout(() => this.checkElementSizeThenCreateChart(), 25);
  }

  private backgroundColor = '';
  private contrastColor = '';
  private primaryColor = '';
  private secondaryColor = '';
  private selectingColor = '';
  private selectionColor = '';

  private checkElementSizeThenCreateChart(): void {
    this.checkSizeTimeout = undefined;
    if (!this.visible || !this.track1) return;
    const element = this.injector.get(ElementRef).nativeElement;
    this.width = element.offsetWidth;
    this.height = element.offsetHeight;
    if (this.width! > 0 && this.height! > 0) {
      if (this.chartOptions && this.canvas?.chart) {
        const chart = this.canvas.chart;
        setTimeout(() => chart.resize(), 0);
      } else {
        const styles = getComputedStyle(element);
        this.backgroundColor = String(styles.getPropertyValue('--ion-background-color')).trim();
        this.contrastColor = String(styles.getPropertyValue('--ion-text-color')).trim();
        this.primaryColor = String(styles.getPropertyValue('--graph-primary-color')).trim();
        this.secondaryColor = String(styles.getPropertyValue('--graph-secondary-color')).trim();
        this.selectingColor = String(styles.getPropertyValue('--graph-selecting-color')).trim();
        this.selectionColor = String(styles.getPropertyValue('--graph-selection-color')).trim();
        setTimeout(() => this.createChart(), 0);
      }
    } else
      this.checkSizeTimeout = setTimeout(() => this.checkElementSizeThenCreateChart(), 100);
  }

  private selectionRange: PathRange[] = [];

  public setSelection(ranges: PathRange[]): void {
    const plugin = this.chartPlugins.find(p => p instanceof RangeSelection);
    if (plugin) {
      const selection = this.pathRangeToRangeSelection(ranges);
      if (selection) {
        this.selectionRange = [];
        (plugin as RangeSelection).setSelection(selection);
        this.canvas?.chart?.draw();
      }
    } else {
      this.selectionRange = ranges;
    }
  }

  private createChart(): void {
    if (!this.chartOptions) this.buildOptions();
    if (this.chartPlugins.length === 0)
      this.chartPlugins.push(
        new HoverVerticalLine(this.contrastColor),
        new BackgroundPlugin(this.backgroundColor),
        new RangeSelection(
          this.selectingColor, this.selectionColor,
          event => this.selecting.emit(this.rangeSelectionToEvent(event)),
          event => this.selected.emit(this.rangeSelectionToEvent(event)),
          () => this.selectable,
        )
      );

    this.chartData = {
      datasets: []
    }
    this.buildDataSet(this.track1, this.primaryColor);
    if (this.track2) this.buildDataSet(this.track2, this.secondaryColor);
    this.updateMaxDistance();
    setTimeout(() => {
      this.injector.get(ChangeDetectorRef).detectChanges();
      if (this.selectionRange) {
        setTimeout(() => {
          this.setSelection(this.selectionRange);
        }, 0);
      }
    }, 0);
  }

  private updateMaxDistance(): void {
    let maxX = 0;
    for (const ds of this.chartData!.datasets) {
      const pts = ds.data as any[];
      maxX = Math.max(maxX, pts[pts.length - 1].x);
    }
    this.chartOptions!.scales!['x']!.max = maxX;
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
            text: this.i18n.texts.elevationGraph.distance + ' (' + this.i18n.shortUserElevationGraphDistanceUnit() + ')',
            display: true,
            color: this.contrastColor,
            padding: { top: -5, bottom: 0, y: 0 },
          },
          grid: {
            color: new Color(this.contrastColor).setAlpha(0.33).toString()
          },
          border: {
            color: this.contrastColor,
          },
          ticks: {
            color: this.contrastColor,
          }
        },
        y: {
          type: 'linear',
          title: {
            text: this.i18n.texts.elevationGraph.elevation + ' (' + this.i18n.shortUserElevationUnit() + ')',
            display: true,
            color: this.contrastColor,
            padding: { top: 0, bottom: 0, y: 0 },
          },
          grid: {
            color: new Color(this.contrastColor).setAlpha(0.33).toString()
          },
          border: {
            color: this.contrastColor
          },
          ticks: {
            color: this.contrastColor
          }
        }
      },
      interaction: {
        mode: 'index',
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
          boxPadding: 3,
          callbacks: {
            title: (context: any) => {
              const pt: DataPoint = context[0].raw;
              let title = this.i18n.texts.elevationGraph.distance + ': ' + this.i18n.distanceToString(pt.distanceMeters);
              if (pt.timeSinceStart) {
                title += '\n' + this.i18n.texts.elevationGraph.time_duration + ': ';
                title += this.i18n.durationToString(pt.timeSinceStart);
              }
              title += '\n' + this.i18n.texts.elevationGraph.elevation + ':';
              return title;
            },
            label: (context: any) => {
              return context.raw.ele ? this.i18n.elevationToString(context.raw.ele) : '';
            },
            labelColor: (context: any) => {
              return {
                borderColor: context.dataset.borderColor,
                backgroundColor: context.dataset.borderColor,
              };
            }
          }
        }
      },
      events: ['mousemove', 'mouseout', 'click', 'mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend'],
      onHover: (event:any, elements: C.ActiveElement[], chart: any) => {
        const references = elements.filter(element => !!(element?.element as any)?.$context).map(element => this.activeElementToPointReference(element));
        if (references.length === 0 && event.native.detail === -1) return;
        this.pointHover.emit(references);
      },
    };
  }

  private buildDataSet(track: Track, color: string) {
    const ds = {
      fill: 'origin',
      borderColor: color,
      backgroundColor: new Color(color).setAlpha(0.2).toString(),
      pointColor: color,
      strokeColor: color,
      fillColor: color,
      pointStyle: false,
      parsing: false,
      data: []
    };
    for (let segmentIndex = 0; segmentIndex < track.segments.length; segmentIndex++) {
      const segment = track.segments[segmentIndex];
      for (let pointIndex = 0; pointIndex < segment.points.length; pointIndex++) {
        const pt = segment.points[pointIndex];
        (ds.data as any[]).push(this.createDataPoint(ds.data.length === 0 ? undefined : ds.data[ds.data.length - 1], pt, segmentIndex, pointIndex, track));
      }
    }
    this.chartData!.datasets.push(ds as any);
  }

  private updateRecordingData(ds: any, track: Track): void {
    if (!this.canvas?.chart) return;
    let pointCount = 0;
    for (let segmentIndex = 0; segmentIndex < track.segments.length; segmentIndex++) {
      const segment = track.segments[segmentIndex];
      for (let pointIndex = 0; pointIndex < segment.points.length; pointIndex++) {
        if (pointCount < ds.data.length - 1) {
          pointCount++;
          continue;
        }
        if (pointCount === ds.data.length - 1) {
          // latest known point => update it
          ds.data[pointCount] = this.createDataPoint(pointCount === 0 ? undefined : ds.data[pointCount - 1], segment.points[pointIndex], segmentIndex, pointIndex, track);
        } else {
          ds.data.push(this.createDataPoint(pointCount === 0 ? undefined : ds.data[pointCount - 1], segment.points[pointIndex], segmentIndex, pointIndex, track));
        }
        pointCount++;
      }
    }
    this.updateMaxDistance();
    if (this.canvas!.chart!.options!.scales!['x']!.max !== this.chartOptions!.scales!['x']!.max) {
      this.canvas!.chart!.options!.scales!['x']!.max = this.chartOptions!.scales!['x']!.max;
    }
    this.canvas?.chart?.update();
  }

  private createDataPoint(previous: DataPoint | undefined, point: Point, segmentIndex: number, pointIndex: number, track: Track): DataPoint {
    let distance = previous?.distanceMeters || 0;
    if (pointIndex > 0) distance += point.distanceTo(previous!);
    let timeSinceStart = undefined;
    if (previous && previous.timeSinceStart && previous.time && point.time)
      timeSinceStart = previous.timeSinceStart + (point.time - previous.time);
    else if (point.time) {
      const start = track.startDate;
      if (start) timeSinceStart = point.time - start;
    }
    return {
      x: this.i18n.elevationGraphDistanceValue(this.i18n.distanceInUserUnit(distance)),
      y: point.ele !== undefined ? this.i18n.elevationInUserUnit(point.ele) : null,
      segmentIndex,
      pointIndex,
      time: point.time,
      timeSinceStart,
      lat: point.pos.lat,
      lng: point.pos.lng,
      ele: point.ele,
      distanceMeters: distance
    };
  }

  public showCursorForPosition(lat: number, lng: number): void {
    if (!this.canvas || !this.canvas.chart || !this.chartData) {
      return;
    }
    for (let dsIndex = 0; dsIndex < this.chartData.datasets.length; dsIndex++) {
      const pointIndex = this.chartData.datasets[dsIndex].data.findIndex((pt: any) => pt.lat === lat && pt.lng === lng);
      if (pointIndex >= 0) {
        const meta = this.canvas.chart.getDatasetMeta(dsIndex);
        const ptElement = meta.data[pointIndex];
        const rectangle = this.canvas.chart.canvas.getBoundingClientRect();
        if (!isNaN(rectangle.left) && !isNaN(rectangle.top) && !isNaN(ptElement.x) && !isNaN(ptElement.y)) {
          const mouseMoveEvent = new MouseEvent('mousemove', {
            clientX: rectangle.left + ptElement.x,
            clientY: rectangle.top + ptElement.y,
            detail: -1,
          });
          this.canvas.chart.canvas.dispatchEvent(mouseMoveEvent);
        }
        return;
      }
    }
    this.hideCursor();
  }

  public hideCursor(): void {
    this.canvas?.chart?.canvas.dispatchEvent(new MouseEvent('mouseout'));
  }

  private activeElementToPointReference(element: C.ActiveElement): ElevationGraphPointReference {
    const pt: DataPoint = (element.element as any).$context.raw;
    const e: C.PointElement = element.element as C.PointElement;
    return new ElevationGraphPointReference(
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
      events.push(new ElevationGraphRange(
        ds.datasetIndex === 0 ? this.track1 : this.track2!,
        this.activeElementToPointReference(ds.start),
        this.activeElementToPointReference(ds.end),
      ));
    }
    return events;
  };

  private pathRangeToRangeSelection(ranges: PathRange[]): SelectedRange | undefined {
    if (ranges.length === 0 || !this.canvas?.chart) return undefined;
    const chart = this.canvas.chart;
    const selection: SelectedRange = {
      startX: -1,
      startElements: [],
      endX: -1,
      endElements: [],
    };
    for (const range of ranges) {
      const datasetIndex = range.track === this.track1 ? 0 : 1;
      const startIndex = this.chartData!.datasets[datasetIndex].data.findIndex(d => (d as DataPoint).segmentIndex === range.startSegmentIndex && (d as DataPoint).pointIndex === range.startPointIndex);
      if (startIndex >= 0) {
        const startData = this.chartData!.datasets[datasetIndex].data[startIndex] as DataPoint;
        if (selection.startX === -1) {
          selection.startX = chart.scales['x'].getPixelForValue((startData as DataPoint).x);
        }
        const element = new C.PointElement(chart.getDatasetMeta(datasetIndex).data[startIndex]);
        (element as any).$context = {
          raw: startData
        };
        selection.startElements!.push({
          datasetIndex: datasetIndex,
          index: startIndex,
          element: element,
        });
      }
      const endIndex = this.chartData!.datasets[datasetIndex].data.findIndex(d => (d as DataPoint).segmentIndex === range.endSegmentIndex && (d as DataPoint).pointIndex === range.endPointIndex);
      if (endIndex >= 0) {
        const endData = this.chartData!.datasets[datasetIndex].data[endIndex] as DataPoint;
        if (selection.endX === -1) {
          selection.endX = chart.scales['x'].getPixelForValue((endData as DataPoint).x);
        }
        const element = new C.PointElement(chart.getDatasetMeta(datasetIndex).data[endIndex]);
        (element as any).$context = {
          raw: endData
        };
        selection.endElements!.push({
          datasetIndex: datasetIndex,
          index: endIndex,
          element: element,
        });
      }
    }
    return selection;
  }

}
