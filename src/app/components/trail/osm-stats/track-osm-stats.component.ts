import { NgClass, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Injector, Input, Output } from '@angular/core';
import { of } from 'rxjs';
import { Track } from 'src/app/model/track';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { HikingDifficulty, WaySurface, WayType, WayVisibility } from 'src/app/services/map/way';
import { AbstractComponent } from 'src/app/utils/component-utils';
import { TrackOsmStatInfo, TrackOsmStats, TrackSection, trackSectionsComparator } from 'src/app/utils/track-computed-data/track-osm-stats';
import { PercentCircleComponent } from '../../percent-circle/percent-circle.component';

type Stat<T> = {value: T | undefined, percent: number, distance: number, sections: TrackSection[]}

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
  imports: [NgTemplateOutlet, NgClass, PercentCircleComponent]
})
export class TrackOsmStatsComponent extends AbstractComponent {

  @Input() track?: Track;
  @Output() trackSectionsHighlighted = new EventEmitter<{track: Track, sections: TrackSection[]} | null>();

  stats: Stats | null | undefined;
  previousSelection?: TrackSection[];

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
    this.byStateAndVisible.subscribe(
      this.track ? this.track.computed.osmStats$ : of(undefined),
      stats => this.stats = this.processStats(stats)
    )
  }

  private processStats(stats: TrackOsmStats | null | undefined): Stats | null | undefined {
    this.trackSectionsHighlighted.emit(null);
    this.previousSelection = undefined;
    if (!stats) return stats;
    if (stats.osmTotalDistanceMeters === 0) return undefined;
    return {
      wayType: this.mapToStat(stats, stats.wayType, new Map()),
      surface: this.mapToStat(stats, stats.surface, new Map([[3, 2], [4, 5]])),
      hikingDifficulty: this.mapToStat(stats, stats.hikingDifficulty, new Map()),
      visibility: this.mapToStat(stats, stats.visibility, new Map()),
    };
  }

  private mapToStat<T>(stats: TrackOsmStats, map: Map<T, TrackOsmStatInfo>, merges: Map<T,T>): {value: T | undefined, percent: number, distance: number, sections: TrackSection[]}[] | undefined {
    const result:{value: T | undefined, percent: number, distance: number, sections: TrackSection[]}[] = [];
    let remaining = stats.osmTotalDistanceMeters;
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
    for (const entry of mergedMap.entries()) {
      const value = entry[0];
      const info = entry[1];
      const percent = Math.floor(info.distance * 100 / stats.osmTotalDistanceMeters);
      remaining -= info.distance;
      if (percent >= 1) // less than 5% is not interesting
        result.push({value, percent, distance: info.distance, sections: info.sections});
    }
    if (remaining > 0) {
      const percent = Math.floor(remaining * 100 / stats.osmTotalDistanceMeters);
      if (percent >= 50) return undefined; // more than helf is unknown, not interesting
      if (percent >= 5)
        result.push({value: undefined, percent, distance: remaining, sections: []});
    }
    result.sort((s1, s2) => s2.distance - s1.distance);
    return result;
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
