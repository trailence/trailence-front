import { Injectable } from '@angular/core';
import { I18nService } from '../i18n/i18n.service';

export class Progress {

  private _workDone: number = 0;
  private readonly _divTitle: HTMLDivElement;
  private readonly _divProgress: HTMLDivElement;
  private readonly _divInnerProgress: HTMLDivElement;
  private readonly _divSubTitle: HTMLDivElement;

  constructor(
    private readonly _service: ProgressService,
    private readonly _container: HTMLDivElement,
    _title: string,
    private _workAmount: number,
    i18n: I18nService,
    private readonly _oncancel?: () => void,
  ) {
    _container.className = 'progress-item';
    this._divTitle = document.createElement('DIV') as HTMLDivElement;
    this._divProgress = document.createElement('DIV') as HTMLDivElement;
    this._divInnerProgress = document.createElement('DIV') as HTMLDivElement;
    this._divSubTitle = document.createElement('DIV') as HTMLDivElement;
    const footer = document.createElement('DIV') as HTMLDivElement;
    _container.appendChild(this._divTitle);
    _container.appendChild(this._divProgress);
    this._divProgress.appendChild(this._divInnerProgress);
    _container.appendChild(footer);
    footer.appendChild(this._divSubTitle);

    this._divTitle.className = 'progress-title';
    this._divProgress.className = 'progress-bar';
    this._divInnerProgress.className = 'progress-bar-inner';
    footer.className = 'progress-footer';
    this._divSubTitle.className = 'progress-sub-title';

    this._divTitle.innerText = _title;
    this._divInnerProgress.style.width = '0%';

    if (_oncancel) {
      const cancel = document.createElement('A') as HTMLAnchorElement;
      cancel.href = '#';
      cancel.innerText = i18n.texts.buttons.cancel;
      cancel.className = 'cancel-button';
      footer.appendChild(cancel);
      cancel.onclick = (event: Event) => {
        event.stopPropagation();
        event.preventDefault();
        _oncancel();
      };
    }
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

}

@Injectable({
  providedIn: 'root'
})
export class ProgressService {

  private readonly _container: HTMLDivElement;

  constructor(private readonly i18n: I18nService) {
    this._container = document.createElement('DIV') as HTMLDivElement;
    this._container.className = 'progress-container';
    this._container.style.display = 'none';
    window.document.body.appendChild(this._container);
  }

  public create(title: string, workAmount: number, oncancel?: () => void): Progress {
    const div = document.createElement('DIV') as HTMLDivElement;
    const p = new Progress(this, div, title, workAmount, this.i18n, oncancel);
    this._container.appendChild(div);
    this._container.style.display = '';
    return p;
  }

  public done(div: HTMLDivElement): void {
    if (div.parentElement !== this._container) return;
    div.style.opacity = '0';
    setTimeout(() => {
      if (div.parentElement !== this._container) return;
      this._container.removeChild(div);
    }, 1000);
  }

}
