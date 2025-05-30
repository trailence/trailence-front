import { Injectable } from '@angular/core';

@Injectable({providedIn: 'root'})
export class HighlightService {

  constructor() {
    if (CSS.highlights) {
      this.searchText = new Highlight();
      (CSS.highlights as any).set('search-text', this.searchText);
    }
  }

  private readonly searchText?: Highlight;

  public addSearchText(range: Range): void {
    if (!this.searchText) return;
    (this.searchText as any).add(range);
  }

  public removeSearchText(range: Range): void {
    if (!this.searchText) return;
    (this.searchText as any).delete(range);
  }

}
