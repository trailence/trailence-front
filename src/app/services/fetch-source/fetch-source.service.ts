import { Injectable } from '@angular/core';
import { FetchSourcePlugin, TrailInfo } from './fetch-source.interfaces';
import { DomSanitizer } from '@angular/platform-browser';
import { VisorandoPlugin } from './visorando.plugin';

@Injectable({providedIn: 'root'})
export class FetchSourceService {

  private readonly plugins: FetchSourcePlugin[] = [
    new VisorandoPlugin()
  ];

  constructor(
    private readonly sanitizer: DomSanitizer,
  ) {
  }

  public canFetchTrailInfo(url: string): boolean {
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailInfo(url)) return true;
    }
    return false;
  }

  public getSourceName(url: string): string | undefined {
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailInfo(url)) return plugin.name;
    }
    return undefined;
  }

  public fetchTrailInfo(url: string): Promise<TrailInfo> {
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailInfo(url))
        return plugin.fetchTrailInfo(url, this.sanitizer);
    }
    return Promise.reject();
  }

}
