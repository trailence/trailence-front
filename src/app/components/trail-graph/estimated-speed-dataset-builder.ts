import { Track } from 'src/app/model/track';
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
    const trackEstimation = track.computed.timeEstimationSnapshot;
    let index = 0;
    for (let si = 0; si < track.segments.length; ++si) {
      const points = track.segments[si].points;
      const pointsEstimation = trackEstimation.points[si];
      for (let pi = 0; pi < points.length; ++pi) {
        const pointEstimation = pointsEstimation?.[pi];
        const point = points[pi];
        while (originalData[index].isBreakPoint) {
          ds.data.push({
            isBreakPoint: true,
            x: originalData[index].x,
            y: null,
          });
          index++;
        }
        if (pointEstimation) {
          ds.data.push({
            x: pointEstimation.durationFromStartOnTrack / 60000,
            y: i18n.distanceInLongUserUnit(pointEstimation.speedMetersByHour),
            distance: pointEstimation.distanceFromStart,
            duration: pointEstimation.durationFromStartOnTrack,
            speed: pointEstimation.speedMetersByHour,
            originalDataIndex: index,
            timeFromPreviousPoint: point.durationFromPreviousPoint ?? pointEstimation.estimatedTime,
            distanceFromPreviousPoint: point.distanceFromPreviousPoint,
          });
          originalData[index].estimatedSpeed = pointEstimation.speedMetersByHour;
          originalData[index].estimatedDuration = pointEstimation.estimatedDurationFromStart;
          if (originalData[index].x === 0) {
            originalData[index].x = pointEstimation.durationFromStartOnTrack / 60000;
          }
          if (pointEstimation.smallBreakDuration > 0)
            this.addSmallBreak(pointEstimation.smallBreakDuration, ds, originalData);
        }
        index++;
      }
    }
    ds.data.sort((p1: any, p2: any) => p1.x - p2.x);
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
