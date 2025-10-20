import { Track } from 'src/app/model/track';
import { ESTIMATED_SMALL_BREAK_EVERY, estimateSmallBreakTime, estimateSpeedInMetersByHour } from 'src/app/services/track-edition/time/time-estimation';
import { DataPoint } from './data-point';
import { ComputedPreferences } from 'src/app/services/preferences/preferences';
import { I18nService } from 'src/app/services/i18n/i18n.service';

export class EstimatedSpeedDatasetBuilder {
  public static readonly SPEED_ESTIMATION_COLOR = '#C0C040';

  public static buildSpeedEstimationDataset(track: Track, originalData: DataPoint[], prefs: ComputedPreferences, i18n: I18nService): any {
    const color = this.SPEED_ESTIMATION_COLOR;
    const ds = {
      isSpeedEstimation: true,
      isNotData: true,
      borderColor: color,
      pointColor: color,
      strokeColor: color,
      pointStyle: false,
      parsing: false,
      tension: 0.02,
      data: []
    } as any;
    // 1. estimate speed for each point
    this.fillEstimatedSpeed(ds, track, originalData, prefs, i18n);
    // 2. split data by section of at least 10 points and 1 minute, and apply an ease-in-out function
    this.easeInOutBySection(ds, originalData, i18n);
    return ds;
  }

  private static fillEstimatedSpeed(ds: any, track: Track, originalData: DataPoint[], prefs: ComputedPreferences, i18n: I18nService): void {
    let distance = 0;
    let duration = 0;
    let estimatedDuration = 0;
    let durationSincePreviousBreak = 0;
    let index = 0;
    const trackDistance = track.metadata.distance;
    const segments = track.segments;
    for (const segment of segments) {
      const points = segment.points;
      durationSincePreviousBreak = 0;
      const segmentDuration = segment.duration;
      let durationSinceSegmentStart = 0;
      for (const point of points) {
        const distanceFromPreviousPoint = point.distanceFromPreviousPoint;
        distance += distanceFromPreviousPoint;
        const speed = distanceFromPreviousPoint > 0 ? estimateSpeedInMetersByHour(point, estimatedDuration, prefs.estimatedBaseSpeed) : ds.data.at(-1)?.speed ?? 0;
        const estimatedTime = speed > 0 ? distanceFromPreviousPoint * (60 * 60 * 1000) / speed : 0;
        estimatedDuration += estimatedTime;
        let timeFromPreviousPoint = point.durationFromPreviousPoint ?? estimatedTime;
        duration += timeFromPreviousPoint;
        durationSincePreviousBreak += timeFromPreviousPoint;
        durationSinceSegmentStart += timeFromPreviousPoint;
        while (originalData[index].isBreakPoint) {
          ds.data.push({
            isBreakPoint: true,
            x: originalData[index].x,
            y: null,
          });
          index++;
        }
        ds.data.push({
          x: duration,
          y: i18n.distanceInLongUserUnit(speed),
          distance,
          duration,
          speed,
          distanceFromPreviousPoint,
          timeFromPreviousPoint,
          originalDataIndex: index,
        });
        originalData[index].estimatedSpeed = speed;
        if (originalData[index].x === 0) originalData[index].x = duration;
        index++;
        if (durationSincePreviousBreak >= ESTIMATED_SMALL_BREAK_EVERY &&
          distanceFromPreviousPoint > 0 &&
          (!segmentDuration || segmentDuration - durationSinceSegmentStart > ESTIMATED_SMALL_BREAK_EVERY / 2) && // no break if less than 30 minutes remaining
          (segmentDuration || (trackDistance > 0 && trackDistance - distance > prefs.estimatedBaseSpeed * 0.4)) // no break if no time info and remaining distance is around 30 minutes
        ) {
          const breakTime = estimateSmallBreakTime(duration);
          this.addSmallBreak(breakTime, ds, originalData);
          estimatedDuration += breakTime;
          durationSincePreviousBreak = 0;
        }
      }
    }
  }

  private static addSmallBreak(breakTime: number, ds: any, originalData: DataPoint[]): void {
    let t = 0;
    for (let i = ds.data.length - 1; i >= 0 && i >= ds.data.length - 100; --i) {
      if (ds.data[i].timeFromPreviousPoint === undefined) continue;
      t += ds.data[i].timeFromPreviousPoint;
      if (t <= breakTime) {
        ds.data[i].speed = 0;
        ds.data[i].y = 0;
        originalData[ds.data[i].originalDataIndex].estimatedSpeed = 0;
      } else {
        const tDelta = 1 - (t - breakTime) / ds.data[i].timeFromPreviousPoint;
        ds.data[i].speed *= tDelta;
        ds.data[i].y *= tDelta;
        originalData[ds.data[i].originalDataIndex].estimatedSpeed = ds.data[i].speed;
        break;
      }
    }
  }

  private static easeInOutBySection(ds: any, originalData: DataPoint[], i18n: I18nService): void {
    let startIndex = 0;
    let previousMiddle = -1;
    let previousMiddleRemainingDistance = 0;
    let previousAverageSpeed = 0;
    while (startIndex < ds.data.length) {
      const section = this.nextSection(ds, startIndex);
      if (!section) {
        startIndex++;
        previousMiddle = -1;
        continue;
      }
      if (previousMiddle === -1) {
        let d = 0;
        for (let i = startIndex; i <= section.middleIndex && i < ds.data.length; ++i) {
          if (ds.data[i].isBreakPoint) continue;
          d += ds.data[i].distanceFromPreviousPoint;
          const x = d / section.middleDistance;
          const easeInOut = -(Math.cos(Math.PI * x) - 1) / 2;
          const speed = section.averageSpeed * easeInOut;
          ds.data[i].y = i18n.distanceInLongUserUnit(speed);
          ds.data[i].speed = speed;
          originalData[ds.data[i].originalDataIndex].estimatedSpeed = speed;
        }
      } else {
        let d = 0;
        for (let i = previousMiddle + 1; i <= section.middleIndex; ++i) {
          if (ds.data[i].isBreakPoint) continue;
          d += ds.data[i].distanceFromPreviousPoint;
          const x = d / (previousMiddleRemainingDistance + section.middleDistance);
          const easeInOut = -(Math.cos(Math.PI * x) - 1) / 2;
          const speed = previousAverageSpeed + (section.averageSpeed - previousAverageSpeed) * easeInOut;
          ds.data[i].y = i18n.distanceInLongUserUnit(speed);
          ds.data[i].speed = speed;
          originalData[ds.data[i].originalDataIndex].estimatedSpeed = speed;
        }
      }
      startIndex = section.endIndex + 1;
      previousMiddle = section.middleIndex;
      previousMiddleRemainingDistance = section.totalDistance - section.middleDistance;
      previousAverageSpeed = section.averageSpeed;
    }
    // finally fill the end
    for (let i = previousMiddle + 1; i < ds.data.length; ++i) {
      if (ds.data[i].isBreakPoint) continue;
      ds.data[i].y = i18n.distanceInLongUserUnit(previousAverageSpeed);
    }
  }

  private static nextSection(ds: any, startIndex: number): {endIndex: number, middleIndex: number, middleDistance: number, totalDistance: number, averageSpeed: number} | undefined {
    if (ds.data[startIndex].speed === 0) return undefined;
    let sectionDistance = 0;
    let sectionTime = 0;
    let sectionSpeed = 0;
    let endIndex = startIndex + 1;
    for (; endIndex < ds.data.length; ++endIndex) {
      if (ds.data[endIndex].speed === 0) {
        endIndex--;
        break;
      }
      if (ds.data[endIndex].isBreakPoint) continue;
      sectionDistance += ds.data[endIndex].distanceFromPreviousPoint;
      sectionTime += ds.data[endIndex].timeFromPreviousPoint;
      sectionSpeed += ds.data[endIndex].speed * ds.data[endIndex].distanceFromPreviousPoint;
      if (endIndex - startIndex >= 10 && sectionTime >= 60 * 1000) {
        break;
      }
    }
    if (endIndex === startIndex) return undefined;

    const averageSpeed = sectionSpeed / sectionDistance;
    let middleIndex = startIndex;
    let middleDistance = 0;
    while (middleIndex < endIndex && middleDistance < sectionDistance / 2) {
      middleIndex++;
      if (ds.data[middleIndex].isBreakPoint) continue;
      middleDistance += ds.data[middleIndex].distanceFromPreviousPoint;
    }
    return {endIndex, middleIndex, middleDistance, totalDistance: sectionDistance, averageSpeed}
  }
}
