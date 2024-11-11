import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { Photo } from 'src/app/model/photo';
import { PhotoComponent } from '../photo/photo.component';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { CommonModule } from '@angular/common';
import { IonButton, IonIcon, GestureController, Gesture, GestureDetail } from "@ionic/angular/standalone";
import { IdGenerator } from 'src/app/utils/component-utils';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-photos-slider',
  templateUrl: './photos-slider.component.html',
  styleUrls: ['./photos-slider.component.scss'],
  standalone: true,
  imports: [IonIcon, IonButton, PhotoComponent, CommonModule]
})
export class PhotosSliderComponent implements OnInit, OnDestroy, OnChanges {

  @Input() photos: Photo[] = [];
  @Input() index: number = 0;
  @Input() width?: number;
  @Input() height?: number;

  items: Item[] = [];
  screenWidth = 1;
  screenHeight = 1;
  scroll: number = 0;
  id = IdGenerator.generateId();

  private browserSubscription?: Subscription;
  private gesture?: Gesture;

  constructor(
    private readonly browser: BrowserService,
    private readonly gestureController: GestureController,
    private readonly changesDetector: ChangeDetectorRef,
  ) {
  }

  private destroyed = false;
  ngOnDestroy(): void {
    this.destroyed = true;
    this.browserSubscription?.unsubscribe();
    this.gesture?.destroy();
  }

  ngOnInit(): void {
    setTimeout(() => {
      if (this.destroyed) return;
      let lastTimestamp = 0;
      const move = (detail: GestureDetail) => {
        this.scroll = this.index * this.screenWidth + detail.startX - detail.currentX;
        this.changesDetector.detectChanges();
        detail.event.stopPropagation();
        detail.event.preventDefault();
        lastTimestamp = detail.event.timeStamp;
      };
      const end = (detail: GestureDetail) => {
        if (this.index > 0 && detail.currentX - detail.startX > (this.screenWidth > 300 ? 50 : 20)) {
          this.previous();
        } else if (this.index < this.photos.length - 1 && detail.startX - detail.currentX > (this.screenWidth > 300 ? 50 : 20)) {
          this.next();
        } else {
          this.scroll = this.index * this.screenWidth;
          this.changesDetector.detectChanges();
        }
        detail.event.stopPropagation();
        detail.event.preventDefault();
        lastTimestamp = detail.event.timeStamp;
      };
      const element = document.getElementById(this.id + '-photos-container')!;
      this.gesture = this.gestureController.create({
        el: element,
        threshold: this.screenWidth > 300 ? 15 : 5,
        direction: 'x',
        gestureName: 'photos-slider',
        onMove: move,
        onEnd: end,
        onStart: event => event.event.stopPropagation()
      }, true);
      this.gesture.enable();
      element.addEventListener('click', event => {
        if (event.timeStamp - lastTimestamp < 0.5) {
          event.preventDefault();
          event.stopPropagation();
        }
      });
    }, 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.width && this.height) {
      this.browserSubscription?.unsubscribe();
      this.browserSubscription = undefined;
      this.screenWidth = this.width;
      this.screenHeight = this.height;
    } else {
      this.screenWidth = this.browser.width;
      this.screenHeight = this.browser.height;
      if (!this.browserSubscription) {
        this.browserSubscription = this.browser.resize$.subscribe(size => {
          this.scroll = this.scroll / this.screenWidth * size.width;
          this.screenWidth = size.width;
          this.screenHeight = size.height;
        });
      }
    }
    this.items = this.photos.map((p, index) => ({
      photo: p,
      index,
      loaded: index === this.index || index === this.index - 1 || index === this.index + 1,
    }));
    this.scroll = this.index * this.screenWidth;
  }

  previous(): void {
    if (this.index === 0) return;
    this.index--;
    this.indexChanged();
  }

  next(): void {
    if (this.index >= this.photos.length - 1) return;
    this.index++;
    this.indexChanged();
  }

  private updateLoadedTimeout: any;
  private indexChanged(): void {
    if (this.updateLoadedTimeout) {
      clearTimeout(this.updateLoadedTimeout);
    }
    this.scroll = this.index * this.screenWidth;
    this.changesDetector.detectChanges();
    this.updateLoadedTimeout = setTimeout(() => {
      this.updateLoadedTimeout = undefined;
      for (const item of this.items) item.loaded = item.index === this.index || item.index === this.index - 1 || item.index === this.index + 1;
      this.changesDetector.detectChanges();
    }, 500);
  }

}

interface Item {
  photo: Photo;
  index: number;
  loaded: boolean;
}
