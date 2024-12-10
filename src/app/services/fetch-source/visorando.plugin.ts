import { SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { XmlUtils } from 'src/app/utils/xml-utils';
import { FetchSourcePlugin, TrailInfo } from './fetch-source.interfaces';

export class VisorandoPlugin implements FetchSourcePlugin {

  public name = 'Visorando';

  public canFetchTrailInfo(url: string): boolean {
    return url.startsWith('https://www.visorando.com/');
  }

  public fetchTrailInfo(url: string, sanitizer: DomSanitizer): Promise<TrailInfo> {
    return window.fetch(url).then(response => response.text()).then(text => {
      const result: TrailInfo = {};
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      const metaDescription = doc.querySelector('main header meta[itemprop=mainEntityOfPage');
      const descriptionDivs = metaDescription?.parentElement?.querySelectorAll('div');
      if (descriptionDivs && descriptionDivs.length > 1) {
        const content = descriptionDivs.item(descriptionDivs.length - 1).textContent;
        if (content) result.description = this.sanitize(content, sanitizer) ?? undefined;
      }

      const sections = doc.querySelectorAll('main section');
      for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
        const section = sections.item(sectionIndex)!;
        const article = XmlUtils.getChild(section, 'article');
        if (article) {
          const paragraphs = XmlUtils.getChildren(article, 'p');
          for (let pIndex = 0; pIndex < paragraphs.length; pIndex++) {
            let content = this.sanitize(paragraphs.at(pIndex)!.textContent!, sanitizer);
            if (content?.startsWith('(')) {
              const j = content.indexOf(')');
              let n = content.substring(1, j).trim();
              content = content.substring(j + 1).trim();
              if (!result.wayPoints) result.wayPoints = [];
              if (n === 'D/A') {
                result.wayPoints.push({isDeparture: true, isArrival: true, description: content});
              } else if (!isNaN(parseInt(n))) {
                result.wayPoints.push({number: parseInt(n), description: content});
              }
            }
          }
        }
      }

      const photos = doc.querySelectorAll('a.thumbnail img');
      if (photos.length > 0) {
        result.photos = [];
        for (let i = 0; i < photos.length; ++i) {
          const photo = photos.item(i)! as HTMLImageElement;
          result.photos.push({
            url: photo.src.replace('/thumbnail/t-', '/inter/m-'),
            description: photo.alt
          })
        }
      }

      console.log(result);
      return result;
    });
  }

  private sanitize(content: string, sanitizer: DomSanitizer): string | null {
    return sanitizer.sanitize(SecurityContext.NONE, content.trim().replace('\r', '').replace('\n', ''));
  }

}
