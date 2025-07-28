import { ChangeDetectorRef, Component, ElementRef, Injector, Input, NgZone, ViewChild } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfig } from './chart-config';
import { CommonModule } from '@angular/common';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { combineLatest, debounceTime, Subscription } from 'rxjs';
import { GraphBuilder } from './graph-builder';
import { StatsConfig } from '../stats-config';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { IonButton, IonIcon, GestureController, Gesture } from "@ionic/angular/standalone";

@Component({
  selector: 'app-stats-graph',
  templateUrl: './stats-graph.component.html',
  styleUrl: './stats-graph.component.scss',
  imports: [IonIcon, IonButton,
    BaseChartDirective, CommonModule,
  ]
})
export class StatsGraphComponent extends AbstractComponent {

  @Input() statsConfig?: StatsConfig;

  chartConfig?: ChartConfig;
  width?: number;
  height?: number;
  id = IdGenerator.generateId();

  private readonly builder: GraphBuilder;
  private subscription?: Subscription;
  private styles?: CSSStyleDeclaration;

  @ViewChild('canvas', {read: BaseChartDirective}) canvas?: BaseChartDirective;

  constructor(
    injector: Injector,
    browser: BrowserService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly gestureController: GestureController,
  ) {
    super(injector);
    changeDetector.detach();
    this.builder = new GraphBuilder(injector);
    this.whenVisible.subscribe(browser.resize$.pipe(debounceTime(300)), () => {
      this.resetChart();
    });
    this.visible$.subscribe(() => this.resetChart());
  }

  protected override getComponentState() {
    return {statsConfig: this.statsConfig};
  }

  private _init = false;

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    if (!this.statsConfig) return;
    this._init = true;
    this.byState.add(
      combineLatest([
        this.statsConfig.config$,
        this.injector.get(PreferencesService).preferences$,
      ]).subscribe(() => this.resetChart())
    );
  }

  protected override destroyComponent(): void {
    this.subscription?.unsubscribe();
  }

  public resetChart(): void {
    this.ngZone.runOutsideAngular(() => {
      this.width = undefined;
      this.height = undefined;
      this.styles = undefined;
      this.subscription?.unsubscribe();
      this.subscription = undefined;
      this.gesture?.destroy();
      this.gesture = undefined;
      this.scrollElement?.removeEventListener('scroll', this.scrollListener);
      this.scrollElement = undefined;
      if (this._visibilityTimeout) {
        clearTimeout(this._visibilityTimeout);
        this._visibilityTimeout = undefined;
      }
      if (this.visible && this.statsConfig)
        this._visibilityTimeout = setTimeout(() => this.waitForVisible(), 0);
    });
    if (this._init)
      this.ngZone.run(() => {
        this.changeDetector.detectChanges();
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
          this.styles ??= getComputedStyle(entries[0].target);
          this.buildChart(w, h);
        } else {
          this._visibilityTimeout = setTimeout(() => this.waitForVisible(), 250);
        }
      }
    });
    this._visibilityObserver.observe(this.injector.get(ElementRef).nativeElement);
  }

  hasNavigation = false;
  navigationOffset = 0;
  maxNavigationOffset = 0;
  allLabels: string[] = [];
  allData: number[][] = [];

  private buildChart(width: number, height: number): void {
    this.subscription = this.builder.build(this.statsConfig!, width, height, this.styles!).subscribe(cfg => {
      this.hasNavigation = false;
      this.navigationOffset = 0;
      this.maxNavigationOffset = 0;
      this.allData = [];
      this.gesture?.destroy();
      this.gesture = undefined;
      this.scrollElement?.removeEventListener('scroll', this.scrollListener);
      this.scrollElement = undefined;
      if (cfg) {
        this.allData = cfg.data!.datasets.map(ds => ds.data as number[]);
        this.allLabels = cfg.data!.labels as string[];
        const nb = this.allData[0].length;
        if (nb > cfg.maxDataShown) {
          this.hasNavigation = true;
          this.maxNavigationOffset = nb - cfg.maxDataShown;
          this.navigationOffset = this.maxNavigationOffset;
        }
      }
      this.chartConfig = cfg;
      if (this.hasNavigation) {
        this.width = width - 50;
        this.height = height - 20;
        this.moveDataWithOffset();
        this.createGesture();
        this.updateScrollBar();
      } else {
        this.width = width;
        this.height = height;
      }
      this.changeDetector.detectChanges();
    });
  }

  private moveDataWithOffset(): void {
    for (let ds = 0; ds < this.allData.length; ds++) {
      this.chartConfig!.data!.datasets[ds].data = this.allData[ds].slice(this.navigationOffset, this.navigationOffset + this.chartConfig!.maxDataShown);
    }
    this.chartConfig!.data!.labels = this.allLabels.slice(this.navigationOffset, this.navigationOffset + this.chartConfig!.maxDataShown);
  }

  navigation(diff: number, fromScrollbar = false): void {
    if (!this.canvas?.chart) return;
    this.navigationOffset += diff;
    this.moveDataWithOffset();
    if (!fromScrollbar)
      this.updateScrollBar();
    this.canvas.chart.update('none');
    this.changeDetector.detectChanges();
  }

  private scrollElement?: HTMLElement;
  private readonly scrollListener = (event: Event) => {
    if (!this.scrollElement) return;
    const offset = Math.floor(this.scrollElement.scrollLeft / 20);
    if (offset !== this.navigationOffset) {
      this.navigation(offset - this.navigationOffset, true);
    }
  };
  updateScrollBar(): void {
    setTimeout(() => {
      const element = document.getElementById('navigation-scroll-bar-' + this.id);
      if (!element) return;
      element.scrollLeft = this.navigationOffset * 20;
      if (this.scrollElement !== element) {
        this.scrollElement?.removeEventListener('scroll', this.scrollListener);
      }
      this.scrollElement = element;
      this.scrollElement.addEventListener('scroll', this.scrollListener);
    }, 0);
  }

  private gesture?: Gesture;
  private createGesture(): void {
    if (this.gesture) return;
    const element = document.getElementById(this.id);
    if (!element) {
      setTimeout(() => this.createGesture(), 10);
      return;
    }
    const threshold = this.canvas!.chart!.chartArea.width / this.chartConfig!.maxDataShown;
    let initialOffset = this.navigationOffset;
    this.gesture = this.gestureController.create({
      el: element,
      threshold,
      direction: 'x',
      gestureName: 'stats-graph-scroll',
      onStart: detail => {
        initialOffset = this.navigationOffset;
        detail.event.stopPropagation();
        detail.event.preventDefault();
      },
      onMove: detail => {
        const move = Math.floor((detail.currentX - detail.startX) / threshold);
        const newOffset = Math.max(0, Math.min(initialOffset - move, this.maxNavigationOffset));
        if (newOffset !== this.navigationOffset) {
          this.navigation(newOffset - this.navigationOffset);
        }
        detail.event.stopPropagation();
        detail.event.preventDefault();
      },
      onEnd: detail => {
        detail.event.stopPropagation();
        detail.event.preventDefault();
      },
    });
    this.gesture.enable();
  }

}
