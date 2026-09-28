import { Component, OnInit, ChangeDetectionStrategy, ViewChild, ElementRef } from '@angular/core';
import { DebugService } from './debug.service';
import { ModalController, IonButton, IonSelect, IonSelectOption, IonInput, IonIcon } from '@ionic/angular';
import { ConsoleLevel, LogLine, logLineToDisplay } from '@trailence/utils/console';
import { HighlightService } from '../highlight/highlight.service';

interface Filters {
  levels: ConsoleLevel[];
}

@Component({
  templateUrl: './debug-popup.component.html',
  styleUrl: './debug-popup.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    IonButton, IonSelect, IonSelectOption, IonInput, IonIcon,
  ]
})
export class DebugPopup implements OnInit {

  constructor(
    private readonly debugService: DebugService,
    private readonly modalController: ModalController,
    private readonly highlightService: HighlightService,
  ) {}

  @ViewChild('textarea') textArea?: ElementRef;

  allLogs: LogLine[] = [];
  filters: Filters = {
    levels: Object.values(ConsoleLevel),
  };
  search = '';

  ngOnInit(): void {
    this.refresh();
  }

  private _refreshing = false;
  refresh(): void {
    if (!this.textArea) {
      setTimeout(() => this.refresh(), 100);
      return;
    }
    if (this._refreshing) return;
    this._refreshing = true;
    void this.debugService.getAllLogs()
    .catch(e => {
      console.error('Cannot get native logs', e);
      return [{log: 'No native logs: ' + e, context: {level: ConsoleLevel.ERROR, date: Date.now(), logger: 'debug'}}];
    })
    .then(logs => {
      console.log('logs received', logs.length);
      this.allLogs = logs;
      this.filtersUpdated();
      setTimeout(() => {
        this.textArea!.nativeElement.parentElement.scrollTop = this.textArea!.nativeElement.parentElement.scrollHeight;
        this._refreshing = false;
        this.setSearch(this.search);
      }, 100);
    });
  }

  close(): void {
    void this.modalController.dismiss();
  }

  filtersUpdated(): void {
    if (!this.textArea) return;
    this.textArea.nativeElement.innerText = this.filter(this.allLogs);
  }

  private filter(logs: LogLine[]): string {
    let lines = '';
    for (const log of logs) {
      if (this.matchesFilters(log)) lines += logLineToDisplay(log) + '\n';
    }
    return lines;
  }

  private matchesFilters(log: LogLine): boolean {
    if (!this.filters.levels.includes(log.context.level)) return false;
    return true;
  }

  private highlights: Range[] = [];
  selectedNodeIndex = 0;
  nodes: {node: ChildNode, ranges: Range[]}[] = [];
  setSearch(search?: string): void {
    this.search = (search ?? '').trim();
    if (!this.textArea) return;
    for (const r of this.highlights) this.highlightService.removeSearchText(r);
    this.highlights = [];
    if (this.search.length === 0) return;
    const element = this.textArea.nativeElement;
    const children = element.childNodes;
    this.nodes = [];
    for (let i = 0; i < children.length; ++i) {
      const child = children.item(i);
      if (!child) continue;
      if (child.nodeType === Node.TEXT_NODE) {
        const ranges = this.searchNode(child);
        if (ranges.length > 0) this.nodes.push({node: child, ranges});
      }
    }
    this.selectedNodeIndex = 0;
    this.highlightSelectedNode();
  }

  previousNode(): void {
    this.selectedNodeIndex--;
    this.highlightSelectedNode();
  }

  nextNode(): void {
    this.selectedNodeIndex++;
    this.highlightSelectedNode();
  }

  private highlightSelectedNode(): void {
    const n = this.nodes[this.selectedNodeIndex];
    this.highlightService.selectSearchText(n ? n.ranges : []);
    if (n) {
      let element: Node | null = n.node;
      while (element && !(element instanceof Element)) {
        element = element.previousSibling;
      }
      if (element) {
        (element as Element).scrollIntoView({block: 'nearest'});
        element.nextElementSibling?.scrollIntoView({block: 'nearest'});
      }
    }
  }

  private searchNode(node: Node): Range[] {
    if (!node.nodeValue) return [];
    const text = node.nodeValue.toLowerCase();
    const search = this.search.toLowerCase();
    const ranges = this.createExactTextRanges(text, search, node);
    this.addAllWordsRanges(text, search, node, ranges)

    if (ranges.length > 0) {
      this.highlights.push(...ranges);
      for (const range of ranges)
        this.highlightService.addSearchText(range);
      return ranges;
    }
    return [];
  }

  private createExactTextRanges(text: string, search: string, node: Node): Range[] {
    let pos = text.indexOf(search);
    const ranges: Range[] = [];
    if (pos >= 0) {
      do {
        const range = new Range();
        range.setStart(node, pos);
        range.setEnd(node, pos + search.length);
        ranges.push(range);
        pos = text.indexOf(search, pos + search.length);
      } while (pos > 0);
    }
    return ranges;
  }

  private addAllWordsRanges(text: string, search: string, node: Node, ranges: Range[]): void {
    const words = search.split(' ').map(s => s.trim()).filter(s => s.length > 0);
    const allRanges: Range[] = [...ranges];
    const wordsRanges: Range[][] = words.map(() => []);
    for (let i = 0; i < words.length; ++i) {
      const word = words[i];
      let pos = text.indexOf(word);
      while (pos >= 0) {
        if (!allRanges.some(r => r.startOffset <= pos && r.endOffset >= pos)) {
          const range = new Range();
          range.setStart(node, pos);
          range.setEnd(node, pos + word.length);
          wordsRanges[i].push(range);
          allRanges.push(range);
        }
        pos = text.indexOf(word, pos + word.length);
      }
    }
    if (wordsRanges.every(r => r.length > 0)) {
      for (const list of wordsRanges) ranges.push(...list);
    }
  }

}
