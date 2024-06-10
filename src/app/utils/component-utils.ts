import { Component, ElementRef, Injector, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Resubscribeables, Subscriptions } from './rxjs/subscription-utils';
import { Arrays } from './arrays';

@Component({
  template: ''
})
export abstract class AbstractComponent implements OnInit, OnDestroy, OnChanges {

  protected _parent?: AbstractComponent;
  protected _children: AbstractComponent[] = [];
  protected _visible$ = new BehaviorSubject<boolean>(false);
  protected whenVisible = new Resubscribeables();
  protected whenAlive = new Subscriptions();
  protected byState = new Subscriptions();
  protected byStateAndVisible = new Resubscribeables();

  private _isInit = false;
  private _currentState: any;

  public get visible$(): Observable<boolean> { return this._visible$; }
  public get visible(): boolean { return this._visible$.value; }

  constructor(
    protected injector: Injector,
  ) {
    injector.get(ElementRef).nativeElement['_abstractComponent'] = this;
    this._visible$.subscribe(visible => this._propagateVisible(visible));
  }

  protected initComponent(): void {}
  protected destroyComponent(): void {}

  protected getComponentState(): any {}
  protected onComponentStateChanged(previousState: any, newState: any): void {};


  ngOnInit(): void {
    if (!(this instanceof AbstractPage)) {
      let parentElement = this.injector.get(ElementRef).nativeElement.parentElement;
      while (parentElement && parentElement != window.document.documentElement) {
        if (parentElement['_abstractComponent']) {
          this._parent = parentElement['_abstractComponent'];
          break;
        }
        parentElement = parentElement.parentElement;
      }
      this._parent?._children.push(this);
    }
    this.initComponent();
    this._isInit = true;
    this.setVisible(true);
    this._checkComponentState();
  }

  ngOnDestroy(): void {
    this._visible$.next(false);
    this._visible$.complete();
    this.byState.unsusbcribe();
    this.byStateAndVisible.stop();
    this.whenVisible.stop();
    this.whenAlive.unsusbcribe();
    this.destroyComponent();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this._checkComponentState();
  }

  public setVisible(visible: boolean): void {
    if (visible === this._visible$.value) return;
    this._visible$.next(visible);
    if (visible) {
      this.whenVisible.resume();
      this.byStateAndVisible.resume();
      this._checkComponentState();
    } else {
      this.whenVisible.pause();
      this.byStateAndVisible.pause();
    }
  }

  private _checkComponentState(): void {
    const state = this.getComponentState();
    let needRefresh = false;
    if (!this._currentState) {
      if (state) {
        needRefresh = true;
      }
    } else if (!state) {
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
      this.byState.unsusbcribe();
      this.byStateAndVisible.stop();
      this.onComponentStateChanged(this._currentState, state);
      this._currentState = state;
    }
  }

  protected _propagateVisible(visible: boolean): void {
    for (const child of this._children) {
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
