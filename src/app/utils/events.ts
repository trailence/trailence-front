export type AppEventListener<E> = (event: E) => any;

interface AppEventBinding<S, T> {
  source: AppEvent<S>;
  mapper: (source: S) => T;
  sourceTearDown?: () => void;
};

export class AppEvent<E> {
  private readonly _listeners: AppEventListener<E>[] = [];
  private readonly _bound: AppEventBinding<any, E>[] = [];
  private readonly _listenersListeners: ((hasListeners: boolean) => any)[] = [];

  public addListener(listener: AppEventListener<E>): () => void {
    this._listeners.push(listener);
    if (this._listeners.length === 1 && this._bound.length > 0) {
      for (const binding of this._bound) {
        binding.sourceTearDown = binding.source.addListener(srcEvent => this.trigger(binding.mapper(srcEvent)));
      }
      this._triggerListenersChanged(true);
    }
    return () => this.removeListener(listener);
  }

  public addListenerIfAbsent(listener: AppEventListener<E>): (() => void) | undefined {
    if (this._listeners.includes(listener)) return undefined;
    return this.addListener(listener);
  }

  public removeListener(listener: AppEventListener<E>): void {
    const index = this._listeners.indexOf(listener);
    if (index < 0) return;
    this._listeners.splice(index, 1);
    if (this._listeners.length === 0 && this._bound.length > 0) {
      for (const binding of this._bound) {
        binding.sourceTearDown?.();
        binding.sourceTearDown = undefined;
      }
      this._triggerListenersChanged(false);
    }
  }

  public trigger(event: E): void {
    if (this._listeners.length === 0) return;
    const listeners = [...this._listeners];
    for (const listener of listeners) listener(event);
  }

  public hasListeners(): boolean {
    return this._listeners.length > 0;
  }

  public onListenersChanged(listener: (hasListener: boolean) => any): void {
    this._listenersListeners.push(listener);
  }

  private _triggerListenersChanged(hasListeners: boolean): void {
    if (this._listenersListeners.length === 0) return;
    const listeners = [...this._listenersListeners];
    for (const listener of listeners) listener(hasListeners);
  }

  public bind<T>(source: AppEvent<T>, mapper: (source: T) => E): void {
    const binding: AppEventBinding<T, E> = {source, mapper};
    this._bound.push(binding);
    if (this._listeners.length > 0) {
      binding.sourceTearDown = source.addListener(srcEvent => this.trigger(mapper(srcEvent)));
    }
  }

  public unbind<T>(source: AppEvent<T>): void {
    const index = this._bound.findIndex(b => b.source === source);
    if (index < 0) return;
    const binding = this._bound.splice(index, 1)[0];
    binding.sourceTearDown?.();
  }

}

export class ReplayAppEvent<E> extends AppEvent<E> {

  private _latest?: E;

  public override trigger(event: E): void {
    this._latest = event;
    super.trigger(event);
  }

  public override addListener(listener: AppEventListener<E>): () => void {
    const tearDown = super.addListener(listener);
    if (this._latest) listener(this._latest);
    return tearDown;
  }

  public cancelLatest(): void {
    this._latest = undefined;
  }

}
