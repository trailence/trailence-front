import { Observable } from 'rxjs';
import { MapComponent } from '../map.component';
import { Injector } from '@angular/core';
import * as L from 'leaflet';
import { BadgesConfig, MenuItem } from '../../menus/menu-item';

export interface MapToolContext {
  injector: Injector;
  mapComponent: MapComponent;
  map: L.Map;
}

export type MapToolStringUndefinedFunction = string | undefined | ((ctx: MapToolContext) => string | undefined);
export type MapToolStringFunction = string | undefined | ((ctx: MapToolContext) => string);
export type MapToolBooleanFunction = boolean | ((ctx: MapToolContext) => boolean);

export abstract class MapTool {

  icon: MapToolStringUndefinedFunction;
  label: MapToolStringFunction;
  i18n: MapToolStringFunction;
  color: MapToolStringUndefinedFunction;
  backgroundColor: MapToolStringUndefinedFunction = undefined;
  disabled: MapToolBooleanFunction = false;
  visible: MapToolBooleanFunction = true;
  badges: BadgesConfig | undefined | ((ctx: MapToolContext) => BadgesConfig | undefined);
  spinner: MapToolStringUndefinedFunction;

  execute?: (ctx: MapToolContext) => Observable<any>;

  toMenuItem(contextGetter: () => MapToolContext | undefined): MenuItem {
    const item = new MenuItem()
      .setIcon(this.toMenuFunction(() => this.icon, undefined, contextGetter))
      .setDisabled(this.toMenuFunction(() => this.disabled, false, contextGetter))
      .setVisible(this.toMenuFunction(() => this.visible, false, contextGetter))
      .setTextColor(this.toMenuFunction(() => this.color, '', contextGetter))
      .setBackgroundColor(this.toMenuFunction(() => this.backgroundColor, '', contextGetter))
      .setBadges(this.toMenuFunction(() => this.badges, undefined, contextGetter))
      .setSpinner(this.toMenuFunction(() => this.spinner, undefined, contextGetter))
      .setAction(this.execute ? () => {
        const context = contextGetter();
        if (!context) return;
        this.execute?.(context)?.subscribe({
          complete: () => context.mapComponent.refreshTools(),
        });
      } : undefined)
      ;
    if (this.i18n) item.setI18nLabel(this.toMenuFunction(() => this.i18n!, '', contextGetter));
    else if (this.label) item.setFixedLabel(this.toMenuFunction(() => this.label!, '', contextGetter));
    return item;
  }

  private toMenuFunction<T>(
    getter: () => T | ((ctx: MapToolContext) => T),
    defaultValue: T,
    contextGetter: () => MapToolContext | undefined,
  ): () => T {
    return () => {
      const value = getter();
      if (typeof value === 'function') {
        const context = contextGetter();
        if (!context) return defaultValue
        return (value as ((ctx: MapToolContext) => T))(context);
      }
      return value;
    };
  }


}
