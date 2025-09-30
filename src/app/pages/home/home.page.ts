import { ChangeDetectorRef, Component, Injector } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { GestureController, IonButton } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { environment } from 'src/environments/environment';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Gesture, GestureDetail } from '@ionic/core';
import { IdGenerator } from 'src/app/utils/component-utils';
import { PublicPage } from '../public.page';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { Router } from '@angular/router';
import { first, firstValueFrom, map } from 'rxjs';
import { HttpService } from 'src/app/services/http/http.service';
import { TrackMetadataSnapshot } from 'src/app/model/snapshots';
import { Trail } from 'src/app/model/trail';
import { TrailInfo } from 'src/app/services/fetch-source/fetch-source.interfaces';
import { TrailOverviewComponent } from 'src/app/components/trail-overview/trail-overview.component';

class Slide {
  constructor(
    public desktopImages: string[],
    public mobileImages: string[],
  ) {
    this.hasImages = desktopImages.length > 0;
  }

  public readonly hasImages: boolean;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  imports: [
    IonButton,
    HeaderComponent, CommonModule,
    TrailOverviewComponent,
  ]
})
export class HomePage extends PublicPage {

  id = IdGenerator.generateId();
  slides: Slide[] = [
    new Slide(
      ['trail-list_1'],
      ['trail-list_1', 'trail-list_2'],
    ),
    new Slide(
      ['trace_1'],
      ['trace_1'],
    ),
    new Slide(
      ['trail-details_1'],
      ['trail-details_1', 'trail-details_2'],
    ),
    new Slide(
      ['photos-on-map_1'],
      ['photos-on-map_1'],
    ),
    new Slide([], [])
  ];
  currentSlideIndex = 0;
  currentSlideImageIndex = 0;
  mode!: 'desktop' | 'mobile';
  desktopMaskSize!: number;

  ssUrl = environment.assetsUrl + '/home-page/ss.3';
  maskUrl = environment.assetsUrl + '/home-page/mask.1';

  year = new Date().getFullYear();

  private slideInterval?: any;
  private gesture?: Gesture;

  constructor(
    public readonly i18n: I18nService,
    public readonly prefs: PreferencesService,
    public readonly router: Router,
    private readonly browser: BrowserService,
    private readonly changeDetector: ChangeDetectorRef,
    public readonly auth: AuthService,
    private readonly gestureController: GestureController,
    injector: Injector,
  ) {
    super(injector);
    this.whenVisible.subscribe(this.i18n.texts$, () => this.changeDetector.markForCheck());
    this.updateSize();
    this.whenVisible.subscribe(this.browser.resize$, () => this.updateSize());
    this.visible$.subscribe(visible => {
      if (visible && !this.slideInterval) {
        this.setupInterval();
      } else if (!visible && this.slideInterval) {
        clearInterval(this.slideInterval);
        this.slideInterval = undefined;
      }
      if (visible && !this.gesture) {
        this.setupGesture();
      } else if (!visible && this.gesture) {
        this.gesture.destroy();
        this.gesture = undefined;
      }
    });
  }

  private setupInterval(): void {
    if (this.slideInterval) return;
    this.slideInterval = setInterval(() => {
      this.moveNext(false);
    }, 7500);
  }

  private updateSize(): void {
    const width = this.browser.width;
    const height = this.browser.height;
    if ((width >= 1030 && height >= 690 && height <= 760) || (width >= 800 && height >= 760)) {
      this.mode = 'desktop';
      this.desktopMaskSize = 800;
    } else if ((width >= 830 && height >= 623 && height <= 645) || (width >= 600 && height >= 680)) {
      this.mode = 'desktop';
      this.desktopMaskSize = 600;
    } else {
      this.mode = 'mobile';
    }
    this.setSlide(0, 0, true, false);
    this.changeDetector.markForCheck();
  }

  protected override initComponent(): void {
    this.setSlide(0, 0, true, false);
    this.showExamples();
  }

  setSlide(slideIndex: number, slideImageIndex: number, fromLeft: boolean, stopInterval: boolean): void {
    const currentSlide = document.getElementById(this.getSlideId(this.currentSlideIndex));
    const currentImage = document.getElementById(this.getSlideImageId(this.currentSlideIndex, this.currentSlideImageIndex));
    const newSlide = document.getElementById(this.getSlideId(slideIndex));
    const newImage = document.getElementById(this.getSlideImageId(slideIndex, slideImageIndex));

    if (!currentSlide || (!currentImage && this.slides[this.currentSlideIndex].hasImages) || !newSlide || (!newImage && this.slides[slideIndex].hasImages)) {
      setTimeout(() => this.setSlide(slideIndex, slideImageIndex, fromLeft, stopInterval), 10);
      return;
    }

    this.resetSlides();

    if (slideIndex === this.currentSlideIndex) {
      // move image inside same slide
      // make sure the current is the current
      currentSlide.classList.add('current');
      currentImage?.classList.add('current');
      // prepare next
      if (currentImage !== newImage) {
        newImage!.classList.remove('at-left', 'at-right');
        newImage!.classList.add(fromLeft ? 'at-right' : 'at-left');
        setTimeout(() => {
          currentImage!.classList.remove('current', 'at-right', 'at-left');
          currentImage!.classList.add(fromLeft ? 'at-left' : 'at-right');
          newImage!.classList.add('current');
          newImage!.classList.remove('at-right', 'at-left');
        }, 100);
      }
    } else {
      // move slide
      newSlide.classList.remove('at-left', 'at-right');
      newSlide.classList.add(fromLeft ? 'at-right' : 'at-left');
      const allImages = newSlide.getElementsByClassName('slider-item-image');
      for (let i = 0; i < allImages.length; ++i) {
        const image = allImages.item(i)!;
        image.classList.remove('current', 'at-left', 'at-right');
      }
      newImage?.classList.add('current');
      setTimeout(() => {
        currentSlide.classList.remove('current', 'at-right', 'at-left');
        currentSlide.classList.add(fromLeft ? 'at-left' : 'at-right');
        newSlide.classList.add('current');
        newSlide.classList.remove('at-right', 'at-left');
      }, 100);
    }

    this.currentSlideIndex = slideIndex;
    this.currentSlideImageIndex = slideImageIndex;

    if (stopInterval && this.slideInterval) {
      clearInterval(this.slideInterval);
      this.slideInterval = undefined;
    }
  }

  private resetSlides(): void {
    for (let i = 0; i < this.slides.length; ++i) {
      if (i !== this.currentSlideIndex) document.getElementById(this.getSlideId(i))?.classList.remove('current', 'at-right', 'at-left');
      for (let j = 0; true; ++j) { // NOSONAR
        const img = document.getElementById(this.getSlideImageId(i, j));
        if (!img) break;
        if (j !== this.currentSlideImageIndex)
          img.classList.remove('current', 'at-right', 'at-left');
      }
    }
  }

  private getSlideId(index: number): string {
    return 'slider-' + this.id + '-slide-' + index;
  }

  private getSlideImageId(slideIndex: number, imageIndex: number): string {
    return this.getSlideId(slideIndex) + '-image-' + imageIndex;
  }

  private getSlideNbImages(slideIndex: number): number {
    const slide = this.slides[slideIndex];
    return slide.hasImages ? this.mode === 'desktop' ? slide.desktopImages.length + 1 : slide.mobileImages.length : 1;
  }

  private moveNext(stopInterval: boolean): void {
    if (this.currentSlideImageIndex === this.getSlideNbImages(this.currentSlideIndex) - 1) {
      if (this.currentSlideIndex === this.slides.length - 1)
        this.setSlide(0, 0, true, stopInterval);
      else
        this.setSlide(this.currentSlideIndex + 1, 0, true, stopInterval);
    } else {
      this.setSlide(this.currentSlideIndex, this.currentSlideImageIndex + 1, true, stopInterval);
    }
  }

  private movePrevious(stopInterval: boolean): void {
    if (this.currentSlideImageIndex === 0) {
      const newSlideIndex = this.currentSlideIndex === 0 ? this.slides.length - 1 : this.currentSlideIndex - 1;
      this.setSlide(newSlideIndex, this.getSlideNbImages(newSlideIndex) - 1, false, stopInterval);
    } else {
      this.setSlide(this.currentSlideIndex, this.currentSlideImageIndex - 1, false, stopInterval);
    }
  }

  setupGesture(): void {
    setTimeout(() => {
      let elementsToMoveWhenGoingBackward: string[];
      let elementsToMoveWhenGoingForward: string[];
      let putIntervalBack = false;
      const slider = document.getElementById('slider-' + this.id)!;
      const start = (detail: GestureDetail) => {
        if (this.slideInterval) {
          clearInterval(this.slideInterval);
          this.slideInterval = undefined;
          putIntervalBack = true;
        }
        this.resetSlides();
        slider.style.setProperty('--transition', 'none');
        detail.event.stopPropagation();
        elementsToMoveWhenGoingForward = [];
        elementsToMoveWhenGoingBackward = [];
        // prepare next and previous
        if (this.currentSlideImageIndex < this.getSlideNbImages(this.currentSlideIndex) - 1) {
          // next is the image
          elementsToMoveWhenGoingForward.push(this.getSlideImageId(this.currentSlideIndex, this.currentSlideImageIndex));
          const nextImageId = this.getSlideImageId(this.currentSlideIndex, this.currentSlideImageIndex + 1);
          elementsToMoveWhenGoingForward.push(nextImageId);
          const nextImage = document.getElementById(nextImageId)!;
          nextImage.classList.remove('at-left', 'at-right');
          setTimeout(() => nextImage.classList.add('at-right'), 0);
        } else {
          // next is the slide with first image
          elementsToMoveWhenGoingForward.push(this.getSlideId(this.currentSlideIndex));
          const nextSlideIndex = this.currentSlideIndex === this.slides.length - 1 ? 0 : this.currentSlideIndex + 1;
          const nextSlideId = this.getSlideId(nextSlideIndex);
          elementsToMoveWhenGoingForward.push(nextSlideId);
          const nextSlide = document.getElementById(nextSlideId)!;
          nextSlide.classList.remove('at-left', 'at-right');
          for (let i = this.getSlideNbImages(nextSlideIndex) - 1; i >= 0; --i) {
            document.getElementById(this.getSlideImageId(nextSlideIndex, i))?.classList.remove('current', 'at-left', 'at-right');
          }
          setTimeout(() => {
            nextSlide.classList.add('at-right');
            document.getElementById(this.getSlideImageId(nextSlideIndex, 0))?.classList.add('current');
          }, 0);
        }
        if (this.currentSlideImageIndex > 0) {
          // previous is the image
          elementsToMoveWhenGoingBackward.push(this.getSlideImageId(this.currentSlideIndex, this.currentSlideImageIndex));
          const previousImageId = this.getSlideImageId(this.currentSlideIndex, this.currentSlideImageIndex - 1);
          elementsToMoveWhenGoingBackward.push(previousImageId);
          const previousImage = document.getElementById(previousImageId)!;
          previousImage.classList.remove('at-left', 'at-right');
          setTimeout(() => previousImage.classList.add('at-left'), 0);
        } else {
          // previous is the slide with last image
          elementsToMoveWhenGoingBackward.push(this.getSlideId(this.currentSlideIndex));
          const previousSlideIndex = this.currentSlideIndex === 0 ? this.slides.length - 1 : this.currentSlideIndex - 1;
          const previousSlideId = this.getSlideId(previousSlideIndex);
          elementsToMoveWhenGoingBackward.push(previousSlideId);
          const previousSlide = document.getElementById(previousSlideId)!;
          previousSlide.classList.remove('at-left', 'at-right');
          for (let i = this.getSlideNbImages(previousSlideIndex) - 1; i >= 0; --i) {
            document.getElementById(this.getSlideImageId(previousSlideIndex, i))?.classList.remove('current', 'at-left', 'at-right');
          }
          setTimeout(() => {
            previousSlide.classList.add('at-left');
            document.getElementById(this.getSlideImageId(previousSlideIndex, this.getSlideNbImages(previousSlideIndex) - 1))?.classList.add('current');
          }, 0);
        }
      };
      const move = (detail: GestureDetail) => {
        const diff = detail.currentX - detail.startX;
        if (diff < 0) {
          // moving forward
          for (const elementId of elementsToMoveWhenGoingBackward)
            document.getElementById(elementId)?.style.setProperty('--moving', '0px');
          for (const elementId of elementsToMoveWhenGoingForward) {
            document.getElementById(elementId)?.style.setProperty('--moving', diff + 'px');
          }
        } else {
          // moving backward
          for (const elementId of elementsToMoveWhenGoingForward)
            document.getElementById(elementId)?.style.setProperty('--moving', '0px');
          for (const elementId of elementsToMoveWhenGoingBackward)
            document.getElementById(elementId)?.style.setProperty('--moving', diff + 'px');
        }
        this.changeDetector.detectChanges();
        detail.event.stopPropagation();
        detail.event.preventDefault();
      };
      const end = (detail: GestureDetail) => {
        for (const elementId of elementsToMoveWhenGoingForward)
            document.getElementById(elementId)?.style.setProperty('--moving', '0px');
        for (const elementId of elementsToMoveWhenGoingBackward)
          document.getElementById(elementId)?.style.setProperty('--moving', '0px');
        slider.style.setProperty('--transition', 'left 0.5s ease-in-out');
        const diff = detail.currentX - detail.startX;
        if (Math.abs(diff) > 15) {
          if (diff < 0) this.moveNext(true);
          else this.movePrevious(true);
        } else if (putIntervalBack) {
          this.setupInterval();
        }
        detail.event.stopPropagation();
        detail.event.preventDefault();
      };
      this.gesture = this.gestureController.create({
        el: slider,
        threshold: 15,
        direction: 'x',
        gestureName: 'home-slider',
        onMove: move,
        onEnd: end,
        onStart: start,
      }, true);
      this.gesture.enable();
    }, 0);
  }

  exampleConfig = {
    mergeDurationAndEstimated: true,
    showBreaksDuration: false,
    showHighestAndLowestAltitude: true,
    allowSmallOnOneLine: true,
    mayHave2Values: false,
    alwaysShowElevation: true,
    showSpeed: false,
  };

  examples?: TrailWithInfo[];
  private async showExamples() {
    const fetchSource = await import('../../services/fetch-source/fetch-source.service').then(m => this.injector.get(m.FetchSourceService));
    const trailence = await firstValueFrom(fetchSource.getAllowedPlugins$().pipe(map(list => list.find(plugin => plugin.name === 'Trailence')),first(p => !!p)));
    const http = this.injector.get(HttpService);
    const uuids = await firstValueFrom(http.get<string[]>(environment.apiBaseUrl + '/public/trails/v1/examples?nb=5'));
    const trails = await trailence.getTrails(uuids);
    const tracks = await trailence.getMetadataList(trails.map(t => t.currentTrackUuid));
    const result: TrailWithInfo[] = [];
    for (const trail of trails) {
      const track = tracks.find(t => t.uuid === trail.currentTrackUuid);
      if (!track) continue;
      const info = await trailence.getInfo(trail.uuid);
      if (!info) continue;
      result.push({trail, track, info});
    }
    this.examples = result;
  }

}

interface TrailWithInfo {
  trail: Trail;
  track: TrackMetadataSnapshot;
  info: TrailInfo;
}
