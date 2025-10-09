import { ChangeDetectorRef, Component, ElementRef, Injector, NgZone, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Resubscribeables, Subscriptions } from './rxjs/subscription-utils';
import { Arrays } from './arrays';
import { ChangesDetection } from './angular-helpers';

@Component({
    template: '',
})
export abstract class AbstractComponent implements OnInit, OnDestroy, OnChanges {

  protected _parent?: AbstractComponent;
  protected _children$ = new BehaviorSubject<AbstractComponent[]>([]);
  protected _visible$ = new BehaviorSubject<boolean>(false);
  protected whenVisible: Resubscribeables;
  protected whenAlive = new Subscriptions();
  protected byState = new Subscriptions();
  protected byStateAndVisible: Resubscribeables;
  protected ngZone: NgZone;
  public changesDetection: ChangesDetection;

  private _isInit = false;
  private _currentState: any = undefined;

  private _initializing = true;
  public get initializing() { return this._initializing; }

  public get visible$(): Observable<boolean> { return this._visible$; }
  public get visible(): boolean { return this._visible$.value; }

  constructor(
    protected injector: Injector,
  ) {
    this.ngZone = injector.get(NgZone);
    this.byStateAndVisible = new Resubscribeables(this.ngZone);
    this.byStateAndVisible.pause();
    this.whenVisible = new Resubscribeables(this.ngZone);
    this.whenVisible.pause();
    injector.get(ElementRef).nativeElement['_abstractComponent'] = this;
    this.changesDetection = new ChangesDetection(this.ngZone, injector.get(ChangeDetectorRef));
    this._visible$.subscribe(visible => this._propagateVisible(visible));
  }

  protected initComponent(): void {} // NOSONAR
  protected destroyComponent(): void {} // NOSONAR

  protected getComponentState(): any {} // NOSONAR
  protected onComponentStateChanged(previousState: any, newState: any): void {};

  protected getChildVisibility(child: AbstractComponent): boolean | undefined {
    return undefined;
  }

  ngOnInit(): void {
    this.changesDetection.pause();
    if (!(this instanceof AbstractPage)) {
      let parentElement = this.injector.get(ElementRef).nativeElement.parentElement;
      while (parentElement && parentElement != window.document.documentElement) {
        if (parentElement['_abstractComponent']) {
          this._parent = parentElement['_abstractComponent'];
          break;
        }
        parentElement = parentElement.parentElement;
      }
      if (this._parent) {
        this._parent._children$.value.push(this);
        this._parent._children$.next(this._parent._children$.value);
      }
    }
    this.initComponent();
    this._isInit = true;
    this.setVisible(!this._parent || (this._parent.visible && this._parent.getChildVisibility(this) !== false));
    this._checkComponentState();
    this._initializing = false;
    this.changesDetection.resume();
  }

  ngOnDestroy(): void {
    this.clearTimeouts();
    this.changesDetection.destroy();
    this._visible$.next(false);
    this._visible$.complete();
    this.byState.unsubscribe();
    this.byStateAndVisible.stop();
    this.whenVisible.stop();
    this.whenAlive.unsubscribe();
    this.clearTimeouts();
    if (this._parent) {
      const index = this._parent._children$.value.indexOf(this);
      if (index >= 0) {
        this._parent._children$.value.splice(index, 1);
        this._parent._children$.next(this._parent._children$.value);
      }
    }
    this.destroyComponent();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this._isInit) return;
    this.changesDetection.pause();
    this.onChangesBeforeCheckComponentState(changes);
    this._checkComponentState();
    this.changesDetection.resume();
  }

  protected onChangesBeforeCheckComponentState(changes: SimpleChanges): void {
    // nothing by default
  }

  private resumeStateAndVisibleTimeout: any;
  private resumeVisibleTimeout: any;
  private pauseVisibleTimeout: any;

  private clearTimeouts(): void {
    if (this.resumeVisibleTimeout) {
      clearTimeout(this.resumeVisibleTimeout);
      this.resumeVisibleTimeout = undefined;
    }
    if (this.resumeStateAndVisibleTimeout) {
      clearTimeout(this.resumeStateAndVisibleTimeout);
      this.resumeStateAndVisibleTimeout = undefined;
    }
    if (this.pauseVisibleTimeout) {
      clearTimeout(this.pauseVisibleTimeout);
      this.pauseVisibleTimeout = undefined;
    }
  }

  public setVisible(visible: boolean): void {
    if (visible === this._visible$.value) return;
    this.clearTimeouts();
    this._visible$.next(visible);
    if (visible) {
      const onVisible = () => {
        this.whenVisible.resume();
        this._checkComponentState();
        if (!this.byStateAndVisible.active) {
          this.resumeStateAndVisibleTimeout = setTimeout(() => {
            this.resumeStateAndVisibleTimeout = undefined;
            this.byStateAndVisible.resume();
          }, 0);
        }
      };
      if (!this.whenVisible.active) {
        this.resumeVisibleTimeout = setTimeout(() => {
          this.resumeVisibleTimeout = undefined;
          onVisible();
        }, 0);
      } else {
        onVisible();
      }
    } else {
      this.pauseVisibleTimeout = setTimeout(() => {
        this.whenVisible.pause();
        this.byStateAndVisible.pause();
      }, 1000);
    }
  }

  private _checkComponentState(): void { // NOSONAR
    const state = this.getComponentState();
    let needRefresh = false;
    if (this._currentState === undefined) {
      if (state !== undefined) {
        needRefresh = true;
      }
    } else if (state === undefined) {
      needRefresh = true;
    } else {
      const currentKeys = Object.getOwnPropertyNames(this._currentState);
      const newKeys = Object.getOwnPropertyNames(state);
      if (!Arrays.sameContent(currentKeys, newKeys)) {
        needRefresh = true;
      } else {
        for (const key of currentKeys) {
          if (state[key] !== this._currentState[key]) {
            needRefresh = true;
            break;
          }
        }
      }
      for (const key in this._currentState) {
        if (state[key] !== this._currentState[key]) {
          needRefresh = true;
          break;
        }
      }
    }

    if (needRefresh) {
      this.byState.unsubscribe();
      this.byStateAndVisible.stop();
      this.onComponentStateChanged(this._currentState, state);
      this._currentState = state;
      if (this.visible) this.byStateAndVisible.resume();
    }
  }

  protected _propagateVisible(visible: boolean): void {
    for (const child of this._children$.value) {
      if (child._isInit) {
        child.setVisible(visible);
      }
    }
  }

}

export abstract class AbstractPage extends AbstractComponent {

  ionViewWillEnter(): void {
    this.setVisible(true);
  }

  ionViewWillLeave(): void {
    this.setVisible(false);
  }

}

export class IdGenerator {

  private static counter = 0;

  public static generateId(prefix: string = 'id-'): string {
    return prefix + (this.counter++) + '-' + new Date().getTime();
  }

}
