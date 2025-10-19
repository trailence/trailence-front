import * as L from 'leaflet';

export class GradeDatasetBuilder {
  public static buildGradeDatasets(originalDs: any): any[] { // NOSONAR
    const points = originalDs.data.filter((d: any) => d.ele !== undefined);
    if (points.length < 2) return [];
    const ds: any[] = [];
    let minY = originalDs.data[0].y;
    for (let i = 1; i < originalDs.data.length; ++i)
      minY = Math.min(minY, originalDs.data[i].y);

    let previousIndex = 0;
    let previousLevel: number | undefined = undefined;
    let distanceFromPrevious = 0;
    let totalGradeFromPrevious = 0;
    for (let i = 1; i < points.length; ++i) {
      const g = Math.abs(points[i].grade.gradeBefore as number);
      if (previousIndex === i - 1 && previousLevel === this.getGradeRange(g)) {
        // same level => add it to the current dataset
        this.addElevationGrade(ds, points, previousIndex, i, minY, previousLevel);
        previousIndex = i;
        continue;
      }
      const d = new L.LatLng(points[i].lat, points[i].lng).distanceTo(points[i - 1] as L.LatLngExpression);
      distanceFromPrevious += d;
      totalGradeFromPrevious += g * d;
      if (distanceFromPrevious === 0) continue;
      const level = this.getGradeRange(totalGradeFromPrevious / distanceFromPrevious);
      if (distanceFromPrevious > 25 || level === previousLevel) {
        previousLevel = this.addElevationGrade(ds, points, previousIndex, i, minY, level);
        previousIndex = i;
        distanceFromPrevious = 0;
        totalGradeFromPrevious = 0;
      }
    }
    if (distanceFromPrevious > 0)
      this.addElevationGrade(ds, points, previousIndex, points.length - 1, minY, this.getGradeRange(totalGradeFromPrevious / distanceFromPrevious));
    return ds;
  }

  public static addElevationGrade(ds: any[], points: any[], startIndex: number, endIndex: number, minY: number, level: number): number {
    const color = this.gradeColors[level] + 'A0';
    if (ds.length === 0 || ds.at(-1).backgroundColor !== color) {
      ds.push({
        isGrade: true,
        isNotData: true,
        backgroundColor: color,
        borderColor: color,
        pointColor: color,
        strokeColor: color,
        borderWidth: 0,
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
    for (let i = startIndex + 1; i <= endIndex; ++i)
      ds.at(-1).data.push({
        x: points[i].x,
        y: minY,
      });
    return level;
  }

  public static readonly gradeColors = [
    '#D8D8D8', // 5%-
    '#FFD890', // 7% to 5%
    '#F0A040', // 10% to 7%
    '#C05016', // 15% to 10%
    '#700000' // 15%+
  ];
  public static readonly gradeLegend = [
    '± 5%',
    '> 5%',
    '> 7%',
    '> 10%',
    '> 15%'
  ];
  private static getGradeRange(grade: number): number {
    if (grade <= 0.05) return 0;
    if (grade <= 0.07) return 1;
    if (grade <= 0.1) return 2;
    if (grade <= 0.15) return 3;
    return 4;
  }
}
