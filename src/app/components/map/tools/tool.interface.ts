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

export type MapToolFunction<T> = T | ((ctx: MapToolContext) => T);

export abstract class MapTool {

  icon: MapToolFunction<string | undefined>;
  label: MapToolFunction<string | undefined>;
  i18n: MapToolFunction<string | undefined>;
  color: MapToolFunction<string | undefined>;
  backgroundColor: MapToolFunction<string | undefined> = undefined;
  disabled: MapToolFunction<boolean> = false;
  visible: MapToolFunction<boolean> = true;
  badges: MapToolFunction<BadgesConfig | undefined>;
  spinner: MapToolFunction<string | undefined>;
  cssVariables: MapToolFunction<{[key: string]: string} | undefined>;

  execute?: (ctx: MapToolContext, event: Event) => Observable<any>;

  toMenuItem(contextGetter: () => MapToolContext | undefined): MenuItem {
    const item = new MenuItem()
      .setIcon(this.toMenuFunction(() => this.icon, undefined, contextGetter))
      .setDisabled(this.toMenuFunction(() => this.disabled, false, contextGetter))
      .setVisible(this.toMenuFunction(() => this.visible, false, contextGetter))
      .setTextColor(this.toMenuFunction(() => this.color, '', contextGetter))
      .setBackgroundColor(this.toMenuFunction(() => this.backgroundColor, '', contextGetter))
      .setBadges(this.toMenuFunction(() => this.badges, undefined, contextGetter))
      .setSpinner(this.toMenuFunction(() => this.spinner, undefined, contextGetter))
      .setCssVariables(this.toMenuFunction(() => this.cssVariables, undefined, contextGetter))
      .setAction(this.execute ? (event) => {
        const context = contextGetter();
        if (!context) return;
        this.execute?.(context, event)?.subscribe({
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
