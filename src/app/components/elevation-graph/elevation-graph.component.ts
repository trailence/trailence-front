import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Injector, Input, Output, ViewChild } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { Track } from 'src/app/model/track';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { Platform } from '@ionic/angular';
import { Chart, ChartData, ChartDataset, CoreChartOptions, DatasetChartOptions, ElementChartOptions, Filler, LineController, LineControllerChartOptions, LineElement, LinearScale, Plugin, PluginChartOptions, Point, PointElement, ScaleChartOptions, Tooltip } from 'chart.js';
import { _DeepPartialObject } from 'chart.js/dist/types/utils';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { Color } from 'src/app/utils/color';
import { AnyObject } from 'chart.js/dist/types/basic';
import { HoverVerticalLine } from './plugins/hover-vertical-line';
import { ElevationGraphPointReference } from './elevation-graph-point-reference';

Chart.register(LinearScale, LineController, PointElement, LineElement, Filler, Tooltip);

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

  @Output() pointHover = new EventEmitter<ElevationGraphPointReference[]>();

  chartOptions?: _DeepPartialObject<CoreChartOptions<"line"> & ElementChartOptions<"line"> & PluginChartOptions<"line"> & DatasetChartOptions<"line"> & ScaleChartOptions<"line"> & LineControllerChartOptions>;
  chartData?: ChartData<"line", (number | Point | null)[]>;
  chartPlugins: Plugin<"line", AnyObject>[] = [];
  width?: number;
  height?: number;

  @ViewChild('canvas', {read: BaseChartDirective}) canvas?: BaseChartDirective;

  constructor(
    injector: Injector,
    platform: Platform,
    private i18n: I18nService,
  ) {
    super(injector);
    this.whenVisible.subscribe(platform.resize, () => this.resetChart());
    this.visible$.subscribe(() => this.resetChart());
    injector.get(ElementRef).nativeElement.addEventListener('mouseout', () => this.pointHover.emit([]));
  }

  protected override getComponentState() {
    return {
      track1: this.track1,
      track2: this.track2,
    }
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.resetChart();
  }

  private checkSizeTimeout?: any;

  private resetChart(): void {
    this.chartOptions = undefined;
    this.chartData = undefined;
    this.width = undefined;
    this.height = undefined;
    if (!this.track1) return;
    if (this.checkSizeTimeout) clearTimeout(this.checkSizeTimeout);
    this.checkSizeTimeout = setTimeout(() => this.checkElementSizeThenCreateChart(), 25);
  }

  private backgroundColor = '';
  private contrastColor = '';

  private checkElementSizeThenCreateChart(): void {
    this.checkSizeTimeout = undefined;
    const element = this.injector.get(ElementRef).nativeElement;
    this.width = element.offsetWidth;
    this.height = element.offsetHeight;
    if (this.width! > 0 && this.height! > 0) {
      const styles = getComputedStyle(element);
      this.backgroundColor = String(styles.getPropertyValue('--ion-background-color')).trim();
      this.contrastColor = String(styles.getPropertyValue('--ion-text-color')).trim();
      this.createChart();
    } else
      this.checkSizeTimeout = setTimeout(() => this.checkElementSizeThenCreateChart(), 100);
  }

  private createChart(): void {
    this.chartOptions = {
      responsive: false,
      backgroundColor: this.backgroundColor,
      color: this.contrastColor,
      animation: false,
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: 0,
          title: {
            text: this.i18n.texts.elevationGraph.distance + ' (' + this.i18n.shortUserDistanceUnit() + ')',
            display: true,
            color: this.contrastColor,
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
        tooltip: {
          boxPadding: 3,
          callbacks: {
            title: (context: any) => {
              const pt = context[0].raw;
              let title = this.i18n.texts.elevationGraph.distance + ': ' + this.i18n.distanceToString(pt.distanceMeters);
              if (pt.timeSinceStart) {
                title += '\n' + this.i18n.texts.elevationGraph.time_duration + ': ';
                title += this.i18n.durationToString(pt.timeSinceStart);
              }
              title += '\n' + this.i18n.texts.elevationGraph.elevation + ':';
              return title;
            },
            label: (context: any) => {
              return this.i18n.elevationToString(context.raw.ele);
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
      onHover: (event:any, elements: any[], chart: any) => {
        const references = elements.filter(element => !!element?.element?.$context).map(element => new ElevationGraphPointReference(
          element.datasetIndex === 0 ? this.track1 : this.track2!,
          element.element.$context.raw.segmentIndex,
          element.element.$context.raw.pointIndex,
          { lat: element.element.$context.raw.lat, lng: element.element.$context.raw.lng },
          element.element.$context.raw.ele,
          element.element.$context.raw.time,
          element.element.$context.element.dataIndex,
          element.element.$context.element.x,
          element.element.$context.element.y,
        ));
        this.pointHover.emit(references);
      },
    };
    this.chartPlugins.push(new HoverVerticalLine(this.contrastColor));

    this.chartData = {
      datasets: []
    }
    let maxDistance = this.buildDataSet(this.track1, '#FF0000');
    // TODO track2
    this.chartOptions!.scales!['x']!.max = this.i18n.distanceInUserUnit(maxDistance);
  }

  private buildDataSet(track: Track, color: string) {
    const ds = {
      label: 'TODO i18n.elevation',
      fill: 'origin',
      borderColor: color,
      backgroundColor: new Color(color).setAlpha(0.2).toString(),
      pointColor: color,
      strokeColor: color,
      fillColor: color,
      pointStyle: false,
      data: []
    };
    let distance = 0;
    let lastPoint = undefined;
    for (let segmentIndex = 0; segmentIndex < track.segments.length; segmentIndex++) {
      const segment = track.segments[segmentIndex];
      lastPoint = undefined;
      for (let pointIndex = 0; pointIndex < segment.points.length; pointIndex++) {
        const pt = segment.points[pointIndex];
        const elevation = pt.ele ? pt.ele : 0;
        if (lastPoint) {
          distance += pt.distanceTo(lastPoint.pos);
        }
        lastPoint = pt;
        let timeSinceStart = undefined;
        if (pt.time && track.segments[0].points[0].time) {
          timeSinceStart = pt.time - track.segments[0].points[0].time;
        }
        const dataPoint = {
          x: this.i18n.distanceInUserUnit(distance),
          y: this.i18n.elevationInUserUnit(elevation),
          segmentIndex,
          pointIndex,
          time: pt.time,
          timeSinceStart,
          lat: pt.pos.lat,
          lng: pt.pos.lng,
          ele: pt.ele,
          distanceMeters: distance
        };
        (ds.data as any[]).push(dataPoint);
      }
    }
    this.chartData!.datasets.push(ds as any);
    return distance;
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
            clientY: rectangle.top + ptElement.y
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


}
