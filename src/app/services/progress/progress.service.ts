import { Injectable } from '@angular/core';
import { I18nService } from '../i18n/i18n.service';
import { GestureController } from '@ionic/angular/standalone';

export class Progress {

  private _workDone: number = 0;
  private readonly _divTitle: HTMLDivElement;
  private readonly _divProgress: HTMLDivElement;
  private readonly _divInnerProgress: HTMLDivElement;
  private readonly _divSubTitle: HTMLDivElement;
  private readonly _divFooter: HTMLDivElement;

  constructor(
    private readonly _service: ProgressService,
    private readonly _container: HTMLDivElement,
    _title: string,
    private _workAmount: number,
    private readonly i18n: I18nService,
  ) {
    _container.className = 'progress-item';
    this._divTitle = document.createElement('DIV') as HTMLDivElement;
    this._divProgress = document.createElement('DIV') as HTMLDivElement;
    this._divInnerProgress = document.createElement('DIV') as HTMLDivElement;
    this._divSubTitle = document.createElement('DIV') as HTMLDivElement;
    this._divFooter = document.createElement('DIV') as HTMLDivElement;
    _container.appendChild(this._divTitle);
    _container.appendChild(this._divProgress);
    this._divProgress.appendChild(this._divInnerProgress);
    _container.appendChild(this._divFooter);
    this._divFooter.appendChild(this._divSubTitle);

    this._divTitle.className = 'progress-title';
    this._divProgress.className = 'progress-bar';
    this._divInnerProgress.className = 'progress-bar-inner';
    this._divFooter.className = 'progress-footer';
    this._divSubTitle.className = 'progress-sub-title';

    this._divTitle.innerText = _title;
    this._divInnerProgress.style.width = '0%';
  }

  public get workAmount(): number { return this._workAmount; }
  public set workAmount(value: number) {
    this._workAmount = value;
    this._updateProgress();
  }

  public get workDone(): number { return this._workDone; }
  public set workDone(value: number) {
    this._workDone = value;
    this._updateProgress();
  }

  public addWorkDone(amount: number): void {
    this._workDone += amount;
    this._updateProgress();
    if (this._workDone >= this._workAmount) this.done();
  }

  public addWorkToDo(amount: number): void {
    this.workAmount += amount;
  }

  public set title(value: string) {
    this._divTitle.innerText = value;
  }

  public set subTitle(value: string) {
    this._divSubTitle.innerText = value;
  }

  public done(): void {
    this._service.done(this._container);
  }

  private _updateProgress(): void {
    this._divInnerProgress.style.width = (this._workDone * 100 / this._workAmount) + '%';
  }

  private readonly _oncancel: (() => Promise<any>)[] = [];

  public addOnCancel(handler: () => Promise<any>) {
    if (this._oncancel.length === 0) {
      const cancel = document.createElement('A') as HTMLAnchorElement;
      cancel.href = '#';
      cancel.innerText = this.i18n.texts.buttons.cancel;
      cancel.className = 'cancel-button';
      this._divFooter.appendChild(cancel);
      cancel.onclick = (event: Event) => {
        event.stopPropagation();
        event.preventDefault();
        this._cancel();
      };
    }
    this._oncancel.push(handler);
  }

  private async _cancel() {
    for (const handler of this._oncancel) {
      await handler();
    }
    this.done();
  }

}

@Injectable({
  providedIn: 'root'
})
export class ProgressService {

  private readonly _container: HTMLDivElement;

  constructor(
    private readonly i18n: I18nService,
    private readonly gestureController: GestureController,
  ) {
    this._container = document.createElement('DIV') as HTMLDivElement;
    this._container.className = 'progress-container';
    this._container.style.display = 'none';
    globalThis.document.body.appendChild(this._container);
    this.setupGesture();
  }

  public create(title: string, workAmount: number, oncancel?: () => Promise<any>): Progress {
    return this._create(undefined, title, workAmount, oncancel);
  }

  public getOrCreate(id: string, title: string, workAmount: number, oncancel?: () => Promise<any>): Progress {
    const existing = this._container.querySelector('#progress-' + id);
    if (!existing) return this._create('#progress-' + id, title, workAmount, oncancel);
    const p = (existing as any).__progress as Progress;
    p.addWorkToDo(workAmount);
    if (oncancel) p.addOnCancel(oncancel);
    return p;
  }

  private _create(id: string | undefined, title: string, workAmount: number, oncancel?: () => Promise<any>): Progress {
    const div = document.createElement('DIV') as HTMLDivElement;
    if (id) div.id = id;
    const p = new Progress(this, div, title, workAmount, this.i18n);
    if (oncancel) p.addOnCancel(oncancel);
    this._container.appendChild(div);
    this._container.style.display = '';
    (div as any).__progress = p;
    return p;
  }

  public done(div: HTMLDivElement): void {
    if (div.parentElement !== this._container) return;
    div.style.opacity = '0';
    div.style.height = div.offsetHeight + 'px';
    div.style.overflow = 'hidden';
    div.style.marginTop = '-6px';
    setTimeout(() => { div.style.height = '0px'; }, 500);
    setTimeout(() => {
      if (div.parentElement !== this._container) return;
      div.remove();
    }, 1000);
  }

  private setupGesture(): void {
    let isOnTop = true;
    let startY = 0;
    const gesture = this.gestureController.create({
      el: this._container,
      threshold: 10,
      direction: 'y',
      gestureName: 'progress-move',
      onStart: detail => {
        startY = detail.currentY;
      },
      onMove: detail => {
        const diff = detail.currentY - startY;
        if (isOnTop) {
          this._container.style.setProperty('--move-y', Math.max(0, diff) + 'px');
        } else {
          this._container.style.setProperty('--move-y', Math.max(0, -diff) + 'px');
        }
      },
      onEnd: detail => {
        this._container.style.setProperty('--move-y', '0px');
        const diff = detail.currentY - startY;
        if (isOnTop && diff > 10) {
          this._container.classList.add('at-bottom');
          isOnTop = false;
        } else if (!isOnTop && diff < -10) {
          this._container.classList.remove('at-bottom');
          isOnTop = true;
        }
      },
      passive: false,
    }, true);
    gesture.enable();
  }

}
