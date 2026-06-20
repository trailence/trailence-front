import { NgClass, NgTemplateOutlet } from '@angular/common';
import { Component, EventEmitter, Injector, Input, Output } from '@angular/core';
import { of } from 'rxjs';
import { Track } from 'src/app/model/track';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { HikingDifficulty, WaySurface, WayType, WayVisibility } from 'src/app/services/map/way';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { TrackOsmStatInfo, TrackOsmStats, TrackSection, trackSectionsComparator } from 'src/app/utils/track-computed-data/track-osm-stats';
import { ProgressBarComponent } from '../../progress-bar/progress-bar.component';
import { IonSpinner } from '@ionic/angular/standalone';
import { I18nPipe } from 'src/app/services/i18n/i18n-string';
import { TrackPointReference } from 'src/app/utils/track-computed-data/types';
import { computePercentagesWithoutDecimal } from 'src/app/utils/math-utils';

type Stat<T> = {value: T | 'unknown' | 'others', percent: number, distance: number, sections: TrackSection[]}

interface Stats {
  wayType: Stat<WayType>[] | undefined;
  surface: Stat<WaySurface>[] | undefined;
  hikingDifficulty: Stat<HikingDifficulty>[] | undefined;
  visibility: Stat<WayVisibility>[] | undefined;
}

@Component({
  selector: 'app-track-osm-stats',
  templateUrl: './track-osm-stats.component.html',
  styleUrl: './track-osm-stats.component.scss',
  imports: [NgTemplateOutlet, NgClass, ProgressBarComponent, IonSpinner, I18nPipe]
})
export class TrackOsmStatsComponent extends AbstractComponent {

  @Input() track?: Track;
  @Output() trackSectionsHighlighted = new EventEmitter<{track: Track, sections: TrackSection[]} | null>();

  stats: Stats | null | undefined;
  previousSelection?: TrackSection[];
  loading = true;
  message?: string;

  constructor(
    injector: Injector,
    public readonly i18n: I18nService,
  ) {
    super(injector);
  }

  protected override getComponentState() {
    return this.track;
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.loading = true;
    this.message = undefined;
    this.byStateAndVisible.subscribe(
      this.track ? this.track.computed.osmStats$ : of(undefined),
      stats => {
        this.stats = this.processStats(stats);
        this.changesDetection.detectChanges();
      }
    )
  }

  private processStats(stats: TrackOsmStats | null | undefined): Stats | null | undefined {
    this.trackSectionsHighlighted.emit(null);
    this.previousSelection = undefined;
    this.loading = false;
    if (!stats) {
      if (this.track) {
        if (stats === null) {
          this.message = 'osm_stats.messages.no_data';
        }
      }
      return stats;
    }
    if (stats.osmTotalDistanceMeters === 0) {
      this.message = 'osm_stats.messages.no_match';
      return undefined;
    }
    if (stats.isPartial)
      this.message = 'osm_stats.messages.partial_data';
    else
      this.message = undefined;
    return {
      wayType: this.mapToStat(stats, stats.wayType, new Map()),
      surface: this.mapToStat(stats, stats.surface, new Map([[3, 2], [4, 5]])),
      hikingDifficulty: this.mapToStat(stats, stats.hikingDifficulty, new Map()),
      visibility: this.mapToStat(stats, stats.visibility, new Map()),
    };
  }

  private mapToStat<T>(stats: TrackOsmStats, map: Map<T, TrackOsmStatInfo>, merges: Map<T,T>): {value: T | 'unknown' | 'others', percent: number, distance: number, sections: TrackSection[]}[] | undefined {
    let mergedMap: Map<T, TrackOsmStatInfo>;
    if (merges.size === 0) mergedMap = map;
    else {
      mergedMap = new Map<T, TrackOsmStatInfo>();
      for (const entry of map.entries()) {
        const mergedKey = merges.get(entry[0]) ?? entry[0];
        const previousValue = mergedMap.get(mergedKey);
        if (previousValue) {
          previousValue.distance += entry[1].distance;
          previousValue.sections.push(...entry[1].sections);
          previousValue.sections.sort(trackSectionsComparator);
        } else {
          mergedMap.set(mergedKey, {distance: entry[1].distance, sections: [...entry[1].sections]});
        }
      }
    }
    const result:{value: T | 'unknown' | 'others', percent: number, distance: number, sections: TrackSection[]}[] = [];
    let remaining = stats.osmTotalDistanceMeters;
    let others = 0;
    let othersSections: TrackSection[] = [];
    for (const entry of mergedMap.entries()) {
      const value = entry[0];
      const info = entry[1];
      const percent = info.distance * 100 / stats.osmTotalDistanceMeters;
      remaining -= info.distance;
      if (percent >= 1) {
        result.push({value, percent, distance: info.distance, sections: info.sections});
      } else {
        others += info.distance;
        othersSections.push(...info.sections);
      }
    }
    let remainingSections: TrackSection[] = [];
    if (remaining > 0) {
      const percent = remaining * 100 / stats.osmTotalDistanceMeters;
      if (percent > 75) return undefined; // not enough data, hide the section
      remainingSections = this.remainingSections([...othersSections, ...result.flatMap(r => r.sections)].sort(trackSectionsComparator));
      if (percent >= 3) {
        result.push({value: 'unknown', percent, distance: remaining, sections: remainingSections});
        remaining = 0;
      }
    }
    if (others + remaining > 0) {
      const percent = (others + remaining) * 100 / stats.osmTotalDistanceMeters;
      result.push({value: 'others', percent, distance: others + remaining, sections: [...othersSections, ...remainingSections].sort(trackSectionsComparator)});
    }
    result.sort((s1, s2) => s2.distance - s1.distance);
    computePercentagesWithoutDecimal(result, 'percent');
    return result.filter(r => r.percent > 0);
  }

  private remainingSections(known: TrackSection[]): TrackSection[] {
    const remaining: TrackSection[] = [];
    let next: TrackPointReference = {segmentIndex: 0, pointIndex: 0};
    for (const s of known) {
      if (s.start.segmentIndex > next.segmentIndex || s.start.pointIndex > next.pointIndex) {
        remaining.push({start: next, end: this.pointBefore(s.start)});
      }
      next = this.pointAfter(s.end);
    }
    if (next.segmentIndex < this.track!.segments.length)
      remaining.push({start: next, end: {segmentIndex: this.track!.segments.length - 1, pointIndex: this.track!.segments.at(-1)!.points.length - 1}});
    return remaining;
  }

  private pointBefore(ref: TrackPointReference): TrackPointReference {
    if (ref.pointIndex > 0) return {segmentIndex: ref.segmentIndex, pointIndex: ref.pointIndex - 1};
    return {segmentIndex: ref.segmentIndex - 1, pointIndex: this.track!.segments[ref.segmentIndex - 1].points.length - 1};
  }

  private pointAfter(ref: TrackPointReference): TrackPointReference {
    if (ref.pointIndex < this.track!.segments[ref.segmentIndex].points.length - 1)
      return {segmentIndex: ref.segmentIndex, pointIndex: ref.pointIndex + 1};
    return {segmentIndex: ref.segmentIndex + 1, pointIndex: 0};
  }

  highlightSections(stat: Stat<any>): void {
    const newSelection = this.track && stat.sections.length > 0 ? stat.sections : undefined;
    if (newSelection === this.previousSelection) {
      this.previousSelection = undefined;
      this.trackSectionsHighlighted.emit(null);
    } else {
      this.previousSelection = stat.sections;
      this.trackSectionsHighlighted.emit({track: this.track!, sections: stat.sections});
    }
    this.changesDetection.detectChanges();
  }

}
