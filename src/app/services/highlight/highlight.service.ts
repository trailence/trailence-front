import { Injectable } from '@angular/core';

@Injectable({providedIn: 'root'})
export class HighlightService {

  constructor() {
    if (CSS.highlights) {
      this.searchText = new Highlight();
      this.selectedSearchText = new Highlight();
      (CSS.highlights as any).set('search-text', this.searchText);
      (CSS.highlights as any).set('selected-search-text', this.selectedSearchText);
    }
  }

  private readonly searchText?: Highlight;
  private readonly selectedSearchText?: Highlight;

  public addSearchText(range: Range): void {
    if (!this.searchText) return;
    (this.searchText as any).add(range);
  }

  public removeSearchText(range: Range): void {
    if (!this.searchText) return;
    (this.searchText as any).delete(range);
  }

  public selectSearchText(ranges: Range[]): void {
    if (!this.selectedSearchText) return;
    this.selectedSearchText.clear();
    for (const range of ranges)
      this.selectedSearchText.add(range);
  }

}
