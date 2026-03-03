import { Component, ElementRef, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Track } from 'src/app/model/track';
import { getGradeRange, gradeColors } from '../trail-graph/grade-values';

@Component({
  selector: 'app-trail-small-elevation-profile',
  template: ``,
})
export class TrailSmallElevationProfileComponent implements OnChanges {

  @Input() track!: Track;
  @Input() width!: number;
  @Input() height!: number;

  constructor(
    private readonly elementRef: ElementRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    this.update();
  }

  private observer?: IntersectionObserver;

  private update(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = undefined;
    }
    this.elementRef.nativeElement.innerHTML = '';
    this.observer = new IntersectionObserver(entries => {
      if (this.observer && entries[0].isIntersecting) {
        this.observer.disconnect();
        this.observer = undefined;
        this.buildGraph();
      }
    });
    this.observer.observe(this.elementRef.nativeElement);
  }

  private buildGraph(): void {
    const canvas = document.createElement('CANVAS') as HTMLCanvasElement;
    canvas.width = this.width;
    canvas.height = this.height;
    this.elementRef.nativeElement.appendChild(canvas);
    const maxDistance = this.track.metadata.distance;
    const minEle = this.track.metadata.lowestAltitude;
    const maxEle = this.track.metadata.highestAltitude;
    if (minEle === undefined || maxEle === undefined || minEle === maxEle || maxDistance === 0) return;
    const yRatio = maxEle - minEle >= 1000 ? this.height / (maxEle - minEle) : this.height / 1000;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    let distance = 0;
    let previous: {x: number, y: number} | undefined = undefined;
    let eleSincePrevious = 0;
    let distSincePrevious = 0;
    let previousGradeX = -1;
    const points: {x: number, y: number}[] = [];
    const grades: {grade: number, y: number}[] = [];
    for (const segment of this.track.segments) {
      for (const point of segment.points) {
        distance += point.distanceFromPreviousPoint;
        distSincePrevious += point.distanceFromPreviousPoint;
        if (point.elevationFromPreviousPoint !== undefined)
          eleSincePrevious += point.elevationFromPreviousPoint;
        const e = point.ele;
        if (e === undefined) continue;
        const x = distance * this.width / maxDistance;
        const y = this.height - ((e - minEle) * yRatio);
        if (!previous) {
          previous = {x, y};
          points.push(previous);
        } else if (x - previous.x >= 1 || Math.abs(y - previous.y) >= 1) {
          const newGradeX = Math.floor(x);
          if (newGradeX > previousGradeX) {
            const grade = Math.abs(eleSincePrevious / distSincePrevious);
            eleSincePrevious = 0;
            distSincePrevious = 0;
            for (let gx = previousGradeX + 1; gx <= newGradeX; gx++)
              grades.push({grade: getGradeRange(grade), y});
            previousGradeX = newGradeX;
          }
          previous = {x, y};
          points.push(previous);
        }
      }
    }
    if (previous) {
      for (let x = 0; x < grades.length; ++x) {
        const g = grades[x].grade;
        const y = grades[x].y;
        const startX = x;
        let dx = 1;
        while (x < grades.length - 1 && grades[x + 1].grade === g && grades[x + 1].y === y) {
          dx++;
          x++;
        }
        ctx.fillStyle = gradeColors[g];
        ctx.fillRect(startX, y, dx, (this.height - y));
      }
    ctx.strokeStyle = '#C06060';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; ++i)
      ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    }
  }

}
