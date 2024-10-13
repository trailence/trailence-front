import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Injector, Input, NgZone, Output, ViewChild } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { Track } from 'src/app/model/track';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import * as C from 'chart.js';
import { getRelativePosition } from 'chart.js/helpers';
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
import { Segment } from 'src/app/model/segment';
import { TrackUtils } from 'src/app/utils/track-utils';
import { BrowserService } from 'src/app/services/browser/browser.service';

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
  grade: {gradeBefore: number | undefined; gradeAfter: number | undefined};
  eleAccuracy?: number;
}

@Component({
  selector: 'app-elevation-graph',
  templateUrl: './elevation-graph.component.html',
  styleUrls: ['./elevation-graph.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  id = IdGenerator.generateId();

  @ViewChild('canvas', {read: BaseChartDirective}) canvas?: BaseChartDirective;

  constructor(
    injector: Injector,
    browser: BrowserService,
    private i18n: I18nService,
    preferencesService: PreferencesService,
    private changeDetector: ChangeDetectorRef,
  ) {
    super(injector);
    changeDetector.detach();
    this.whenVisible.subscribe(browser.resize$, () => this.resetChart());
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
    this.ngZone.runOutsideAngular(() => {
      // when updating a recording track, the latest point may be updated, and new points may appeared
      if (!this.chartData) return;
      const datasetIndex = track === this.track1 ? 0 : track === this.track2 ? 1 : -1;
      if (datasetIndex < 0) return;
      const ds = this.chartData.datasets[datasetIndex];
      this.updateRecordingData(ds, track);
    });
  }

  private checkSizeTimeout?: any;

  public resetChart(): void {
    this.ngZone.runOutsideAngular(() => {
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
    });
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
      const styles = getComputedStyle(element);
      this.backgroundColor = String(styles.getPropertyValue('--ion-background-color')).trim();
      this.contrastColor = String(styles.getPropertyValue('--ion-text-color')).trim();
      this.primaryColor = String(styles.getPropertyValue('--graph-primary-color')).trim();
      this.secondaryColor = String(styles.getPropertyValue('--graph-secondary-color')).trim();
      this.selectingColor = String(styles.getPropertyValue('--graph-selecting-color')).trim();
      this.selectionColor = String(styles.getPropertyValue('--graph-selection-color')).trim();
      this.changeDetector.detectChanges();
      setTimeout(() => this.createChart(), 0);
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
    this.ngZone.runOutsideAngular(() => {
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
      if (this.track1) this.buildDataSet(this.track1, this.primaryColor);
      if (this.track2) this.buildDataSet(this.track2, this.secondaryColor);
      this.updateMaxDistance();
      setTimeout(() => {
        this.changeDetector.detectChanges();
        if (this.selectionRange) {
          setTimeout(() => {
            this.setSelection(this.selectionRange);
          }, 0);
        }
      }, 0);
    });
  }

  private updateMaxDistance(): void {
    let maxX = 0;
    for (const ds of this.chartData!.datasets) {
      const pts = ds.data as any[];
      if (pts.length > 0)
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
            const points: any[] = context.tooltip.dataPoints;
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
              const values: string[] = [];
              let hasValue = false;
              for (const point of points) {
                const v = text(point);
                if (v && v.length > 0) hasValue = true;
                if (v === undefined || v === null) values.push('');
                else values.push(v);
              }
              if (!hasValue) return;
              html += '<tr><th>' + title + '</th>';
              for (const point of points) html += '<td>' + text(point) + '</td>';
              html += '</tr>';
            };
            addInfo(this.i18n.texts.elevationGraph.elevation, pt => this.i18n.elevationToString(pt.raw.ele));
            addInfo(this.i18n.texts.elevationGraph.elevation_grade, pt => {
              let s = '';
              if (pt.raw.grade.gradeBefore !== undefined) s = Math.floor(pt.raw.grade.gradeBefore * 100) + '%';
              if (pt.raw.grade.gradeAfter !== undefined) {
                if (s.length > 0) s += ' / ';
                s += Math.floor(pt.raw.grade.gradeAfter * 100) + '%';
              }
              return s;
            });
            addInfo(this.i18n.texts.elevationGraph.precision, pt => pt.raw.eleAccuracy !== undefined ? ('+/- ' + this.i18n.elevationToString(pt.raw.eleAccuracy)) : '');
            addInfo(this.i18n.texts.elevationGraph.distance, pt => this.i18n.distanceToString(pt.raw.distanceMeters))
            addInfo(this.i18n.texts.elevationGraph.time_duration, pt => this.i18n.durationToString(pt.raw.timeSinceStart));
            html += '<tr><th>' + this.i18n.texts.elevationGraph.location + '</th>';
            for (const point of points) {
              html += '<td>' + this.i18n.coordToString(point.raw.lat) + '<br/>' + this.i18n.coordToString(point.raw.lng) + '</td>';
            }
            html += '</tr>';
            html += '</table>';
            container.innerHTML = html;
            const chartRect = context.chart.canvas.getBoundingClientRect();
            if (context.tooltip.caretX < chartRect.width / 2) {
              container.style.left = (context.tooltip.caretX + 15) + 'px';
              container.style.right = '';
            } else {
              container.style.right = (chartRect.width - context.tooltip.caretX + 15) + 'px';
              container.style.left = '';
            }
            if (context.tooltip.caretY < chartRect.height * 0.3) {
              container.style.top = (context.tooltip.caretY + 5) + 'px';
              container.style.bottom = '';
            } else {
              container.style.bottom = (chartRect.height - context.tooltip.caretY + 5) + 'px';
              container.style.top = '';
            }
          }
        }
      },
      events: ['mousemove', 'mouseout', 'click', 'mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend'],
      onHover: (event:any, elements: C.ActiveElement[], chart: any) => {
        const references = this.canvas!.chart!.getActiveElements().map(element => {
          if ((element.element as any).$context)
            return this.activeElementToPointReference(element);
          return null;
        }).filter(r => !!r);
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
    this.fillDataSet(ds, track);
    this.chartData!.datasets.push(ds as any);
  }

  private fillDataSet(ds: any, track: Track): void {
    for (let segmentIndex = 0; segmentIndex < track.segments.length; segmentIndex++) {
      const segment = track.segments[segmentIndex];
      const points = segment.points;
      for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
        (ds.data as any[]).push(this.createDataPoint(ds.data.length === 0 ? undefined : ds.data[ds.data.length - 1], segmentIndex, pointIndex, track, segment, points));
      }
    }
  }

  private updateRecordingData(ds: any, track: Track): void {
    if (!this.canvas?.chart) return;
    let pointCount = 0;
    for (let segmentIndex = 0; segmentIndex < track.segments.length; segmentIndex++) {
      const segment = track.segments[segmentIndex];
      const points = segment.points;
      for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
        if (pointCount < ds.data.length - 1) {
          pointCount++;
          continue;
        }
        if (pointCount === ds.data.length - 1) {
          // latest known point => update it
          ds.data[pointCount] = this.createDataPoint(pointCount === 0 ? undefined : ds.data[pointCount - 1], segmentIndex, pointIndex, track, segment, points);
        } else {
          ds.data.push(this.createDataPoint(pointCount === 0 ? undefined : ds.data[pointCount - 1], segmentIndex, pointIndex, track, segment, points));
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

  public updateTrack(track: Track): void {
    this.ngZone.runOutsideAngular(() => {
      if (!this.chartData) return;
      const datasetIndex = track === this.track1 ? 0 : track === this.track2 ? 1 : -1;
      if (datasetIndex < 0) return;
      const ds = this.chartData.datasets[datasetIndex];
      ds.data = [];
      this.fillDataSet(ds, track);
      this.updateMaxDistance();
      if (this.canvas!.chart!.options!.scales!['x']!.max !== this.chartOptions!.scales!['x']!.max) {
        this.canvas!.chart!.options!.scales!['x']!.max = this.chartOptions!.scales!['x']!.max;
      }
      this.canvas?.chart?.update();
    });
  }

  private createDataPoint(previous: DataPoint | undefined, segmentIndex: number, pointIndex: number, track: Track, segment: Segment, points: Point[]): DataPoint {
    const point = points[pointIndex];
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
      distanceMeters: distance,
      grade: TrackUtils.elevationGrade(points, pointIndex),
      eleAccuracy: point.eleAccuracy,
    };
  }

  public showCursorForPosition(lat: number, lng: number): void {
    this.ngZone.runOutsideAngular(() => {
      if (!this.canvas || !this.canvas.chart || !this.chartData) {
        return;
      }
      const elements: C.ActiveElement[] = [];
      for (let dsIndex = 0; dsIndex < this.chartData.datasets.length; dsIndex++) {
        const pointIndex = this.chartData.datasets[dsIndex].data.findIndex((pt: any) => pt.lat === lat && pt.lng === lng);
        if (pointIndex >= 0) {
          elements.push({element: this.canvas?.chart.getDatasetMeta(dsIndex).data[pointIndex], datasetIndex: dsIndex, index: pointIndex});
        }
      }
      this.canvas.chart.setActiveElements(elements);
      if (elements.length > 0)
        this.canvas.chart.tooltip!.setActiveElements(elements, elements[0].element);
      this.canvas.chart.update();
});
  }

  public hideCursor(): void {
    this.ngZone.runOutsideAngular(() => {
      if (this.canvas?.chart) {
        this.canvas.chart.setActiveElements([]);
        this.canvas.chart.tooltip!.setActiveElements([], {x: 0, y: 0});
        this.canvas.chart.update();
      }
    });
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

declare module 'chart.js' {
  interface InteractionModeMap {
    myCustomMode: C.InteractionModeFunction;
  }
}

C.Interaction.modes.myCustomMode = function(chart, event, options, useFinalPosition) {
  const position = getRelativePosition(event, chart as any);
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
