import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { Photo } from 'src/app/model/photo';
import { PhotoComponent } from '../photo/photo.component';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { Subscriptions } from 'src/app/utils/rxjs/subscription-utils';
import { CommonModule } from '@angular/common';
import { IonButton, IonIcon, GestureController, Gesture, GestureDetail } from "@ionic/angular/standalone";
import { IdGenerator } from 'src/app/utils/component-utils';

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

  items: Item[] = [];
  screenWidth: number;
  screenHeight: number;
  scroll: number = 0;
  id = IdGenerator.generateId();

  private subscriptions = new Subscriptions();
  private gesture!: Gesture;

  constructor(
    browser: BrowserService,
    private gestureController: GestureController,
  ) {
    this.screenWidth = browser.width;
    this.screenHeight = browser.height;
    this.subscriptions.add(browser.resize$.subscribe(size => {
      this.scroll = this.scroll / this.screenWidth * size.width;
      this.screenWidth = size.width;
      this.screenHeight = size.height;
    }));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.gesture.destroy();
  }

  ngOnInit(): void {
    setTimeout(() => {
      const move = (detail: GestureDetail) => {
        this.scroll = this.index * this.screenWidth + detail.startX - detail.currentX;
      };
      const end = (detail: GestureDetail) => {
        this.scroll = this.index * this.screenWidth;
        if (detail.currentX - detail.startX > 50) {
          this.previous();
        } else if (detail.startX - detail.currentX > 50) {
          this.next();
        }
      };
      this.gesture = this.gestureController.create({
        el: document.getElementById(this.id + '-photos-container')!,
        threshold: 15,
        direction: 'x',
        gestureName: 'photos-slider',
        onMove: move,
        onEnd: end,
      }, true);
      this.gesture.enable();
    }, 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
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
    this.updateLoadedTimeout = setTimeout(() => {
      this.updateLoadedTimeout = undefined;
      for (const item of this.items) item.loaded = item.index === this.index || item.index === this.index - 1 || item.index === this.index + 1
    }, 500);
  }

}

interface Item {
  photo: Photo;
  index: number;
  loaded: boolean;
}
