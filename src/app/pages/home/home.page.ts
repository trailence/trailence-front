import { ChangeDetectorRef, Component, ElementRef, Injector } from '@angular/core';
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

@Component({
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  imports: [IonButton,
    HeaderComponent, CommonModule,
  ]
})
export class HomePage extends PublicPage {

  slide = 0;
  slideInterval?: any;
  slides: Slide[] = [];
  mask: string = '';
  id = IdGenerator.generateId();

  private gesture?: Gesture;

  constructor(
    public readonly i18n: I18nService,
    private readonly element: ElementRef,
    private readonly browser: BrowserService,
    private readonly changeDetector: ChangeDetectorRef,
    public readonly auth: AuthService,
    private readonly gestureController: GestureController,
    injector: Injector,
  ) {
    super(injector);
    this.whenVisible.subscribe(this.i18n.texts$, () => this.updateSlides());
    this.whenVisible.subscribe(this.browser.resize$, () => this.updateSlides());
    this.visible$.subscribe(visible => {
      if (visible && !this.slideInterval) {
        this.slideInterval = setInterval(() => this.nextSlide(), 7500);
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

  protected override initComponent(): void {
    this.setSlide(0);
  }

  /*
  override ionViewWillEnter(): void {
    if (!this.route.snapshot.params['lang']) {
      this.navController.navigateRoot('/home/' + this.preferences.preferences.lang);
      return;
    }
    this.preferences.setLanguage(this.route.snapshot.params['lang']);
    super.ionViewWillEnter();
  }*/

  setupGesture(): void {
    setTimeout(() => {
      const element = document.getElementById('slider-' + this.id)!;
      const start = (detail: GestureDetail) => {
        detail.event.stopPropagation()
      };
      const move = (detail: GestureDetail) => {
        const current = this.element.nativeElement.getElementsByClassName('current') as HTMLCollection;
        if (current.length === 1) {
          if (this.slideInterval) {
            clearInterval(this.slideInterval);
            this.slideInterval = undefined;
          }
          const item = current.item(0) as HTMLElement;
          item.style.left = -(detail.startX - detail.currentX) + 'px';
          item.style.transition = 'none';
        }
        this.changeDetector.detectChanges();
        detail.event.stopPropagation();
        detail.event.preventDefault();
      };
      const end = (detail: GestureDetail) => {
        const current = (this.element.nativeElement.getElementsByClassName('current') as HTMLCollection).item(0) as HTMLElement;
        if (current) {
          current.style.left = '';
          current.style.transition = '';
          const diff = detail.currentX - detail.startX;
          if (Math.abs(diff) > 15) {
            if (diff < 0) this.nextSlide();
            else this.previousSlide();
          }
        }
        detail.event.stopPropagation();
        detail.event.preventDefault();
      };
      this.gesture = this.gestureController.create({
        el: element,
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

  private updateSlides(): void {
    const width = this.browser.width;
    const height = this.browser.height;
    let mask = '';
    if (width >= 800 && height >= 650) {
      mask = '800';
    } else if (width >= 600 && height >= 540) {
      mask = '600';
    } else {
      mask = '600';
    }
    this.mask = environment.assetsUrl + '/home-page/mask_' + mask + '.png';
    this.slides = this.i18n.texts.pages.home.slides.map((slide: any) => ({
      header: slide.header,
      footer: slide.footer
    }));
    this.slides[0].image = environment.assetsUrl + '/home-page/list-and-map.png';
    this.slides[1].image = environment.assetsUrl + '/home-page/build-trace.png';
    this.slides[2].image = environment.assetsUrl + '/home-page/trail-details.png';
    this.slides[3].image = environment.assetsUrl + '/home-page/photos-on-map.png';
    this.changeDetector.markForCheck();
  }

  nextSlide(): void {
    if (this.slide >= this.slides.length - 1) this.setSlide(0); else this.setSlide(this.slide + 1);
  }

  previousSlide(): void {
    if (this.slide === 0) this.setSlide(this.slides.length - 1); else this.setSlide(this.slide - 1);
  }

  setSlide(index: number, stopInterval: boolean = false): void {
    const previous = this.slide;
    this.slide = index;
    const items = this.element.nativeElement.getElementsByClassName('slider-item') as HTMLCollection;
    for (let i = 0; i < items.length; ++i) {
      const item = items.item(i)!;
      if (i === index) {
        item.classList.add('current');
        item.classList.remove('previous', 'from-left', 'from-right');
      } else if (i === previous) {
        item.classList.remove('current');
        item.classList.add('previous', previous < index ? 'from-left' : 'from-right');
      } else {
        item.classList.remove('current', 'previous', 'from-left', 'from-right');
      }
    }
    if (stopInterval && this.slideInterval) {
      clearInterval(this.slideInterval);
      this.slideInterval = undefined;
    }
  }

}

interface Slide {
  header: string;
  footer: string[];
  image?: string;
}
