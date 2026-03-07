import * as L from 'leaflet';
import { getGradeRange, gradeColors } from './grade-values';

export class GradeDatasetBuilder {
  public static buildGradeDatasets(originalDs: any): any[] { // NOSONAR
    const points = originalDs.data.filter((d: any) => d.ele !== undefined);
    if (points.length < 2) return [];
    const ds: any[] = [];
    let minY = originalDs.data[0].y;
    for (let i = 1; i < originalDs.data.length; ++i)
      minY = Math.min(minY, originalDs.data[i].y);
    minY -= 10;

    let previousIndex = 0;
    let previousLevel: number | undefined = undefined;
    let distanceFromPrevious = 0;
    let totalGradeFromPrevious = 0;
    for (let i = 1; i < points.length; ++i) {
      const g = Math.abs(points[i].grade.gradeBefore as number);
      if (previousIndex === i - 1 && previousLevel === getGradeRange(g)) {
        // same level => add it to the current dataset
        this.addElevationGrade(ds, points, previousIndex, i, minY, previousLevel);
        previousIndex = i;
        continue;
      }
      const d = new L.LatLng(points[i].lat, points[i].lng).distanceTo(points[i - 1] as L.LatLngExpression);
      distanceFromPrevious += d;
      totalGradeFromPrevious += g * d;
      if (distanceFromPrevious === 0) continue;
      const level = getGradeRange(totalGradeFromPrevious / distanceFromPrevious);
      if (distanceFromPrevious > 25 || level === previousLevel) {
        previousLevel = this.addElevationGrade(ds, points, previousIndex, i, minY, level);
        previousIndex = i;
        distanceFromPrevious = 0;
        totalGradeFromPrevious = 0;
      }
    }
    if (distanceFromPrevious > 0)
      this.addElevationGrade(ds, points, previousIndex, points.length - 1, minY, getGradeRange(totalGradeFromPrevious / distanceFromPrevious));
    return ds;
  }

  public static addElevationGrade(ds: any[], points: any[], startIndex: number, endIndex: number, minY: number, level: number): number {
    const color = gradeColors[level] + 'A0';
    if (ds.length === 0 || ds.at(-1).backgroundColor !== color) {
      if (ds.length > 0)
        ds.at(-1).data.push({
          x: points[startIndex].x + 0.001,
          y: minY,
        });
      ds.push({
        isGrade: true,
        isNotData: true,
        backgroundColor: color,
        borderColor: color,
        pointColor: color,
        strokeColor: color,
        borderWidth: 10,
        showLine: false,
        spanGaps: false,
        fill: 0,
        radius: 0,
        pointStyle: false,
        parsing: false,
        data: [{
          x: points[startIndex].x,
          y: minY,
        }]
      });
    }
    if (ds.length > 0 && endIndex === points.length - 1) {
      ds.at(-1).data.push({
        x: points[endIndex].x,
        y: minY,
      });
    }
    return level;
  }
}
