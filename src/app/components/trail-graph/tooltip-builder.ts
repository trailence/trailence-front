import { I18nService } from 'src/app/services/i18n/i18n.service';

export function buildTooltip(context: any, container: HTMLElement, isSelecting: boolean, i18n: I18nService) {
  if (context.tooltip.opacity === 0 || isSelecting) {
    container.style.display = 'none';
    return;
  }
  const points: any[] = context.tooltip.dataPoints.filter((p: any) => p.raw.lat !== undefined);
  if (points.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  let html = '<table>';
  if (points.length > 1) {
    html += '<tr class="header"><th></th>';
    for (const point of points) {
      html += '<th><div style="width: 25px; height: 0; display: inline-block; border-bottom: 2px solid ' + point.dataset.strokeColor + ';"></div></th>';
    }
    html += '</tr>';
  }
  const addInfo = (title: string, text: (pt: any) => string) => {
    let hasValue = false;
    for (const point of points) {
      const v = text(point);
      if (v && v.length > 0) {
        hasValue = true;
        break;
      }
    }
    if (!hasValue) return;
    html += '<tr><th>' + title + '</th>';
    for (const point of points) html += '<td>' + text(point) + '</td>';
    html += '</tr>';
  };
  addInfo(i18n.texts.trailGraph.elevation, pt => {
    let s = i18n.elevationToString(pt.raw.ele);
    if (pt.raw.eleAccuracy !== undefined) {
      s += ' (± ' + i18n.elevationToString(pt.raw.eleAccuracy) + ')';
    }
    return s;
  });
  addInfo(i18n.texts.trailGraph.elevation_grade, pt => {
    let s = '';
    if (pt.raw.grade.gradeBefore !== undefined) s = Math.floor(pt.raw.grade.gradeBefore * 100) + '%';
    if (pt.raw.grade.gradeAfter !== undefined) {
      if (s.length > 0) s += ' / ';
      s += Math.floor(pt.raw.grade.gradeAfter * 100) + '%';
    }
    return s;
  });
  addInfo(i18n.texts.trailGraph.distance, pt => i18n.distanceToString(pt.raw.distanceMeters));
  addInfo(i18n.texts.trailGraph.time_duration, pt => i18n.durationToString(pt.raw.timeSinceStart));
  addInfo(i18n.texts.trailGraph.speed, pt => {
    const s1 = pt.raw.speedInMeters ? i18n.getSpeedStringInUserUnit(i18n.getSpeedInUserUnit(pt.raw.speedInMeters)) : '';
    const s2 = pt.raw.estimatedSpeed ? i18n.getSpeedStringInUserUnit(i18n.getSpeedInUserUnit(pt.raw.estimatedSpeed)) : '';
    if (s1.length === 0) {
      if (s2.length === 0) return '';
      return '≈ ' + s2;
    } else {
      if (s2.length === 0) return s1;
      return s1 + ' (≈ ' + s2 + ')';
    }
  });
  html += '<tr><th>' + i18n.texts.trailGraph.location + '</th>';
  for (const point of points) {
    html += '<td>';
    html += i18n.coordToString(point.raw.lat) + '<br/>' + i18n.coordToString(point.raw.lng)
    if (point.raw.posAccuracy !== undefined) {
      html += ' (± ' + i18n.distanceToString(point.raw.posAccuracy) + ')';
    }
    html += '</td>';
  }
  html += '</tr>';
  html += '</table>';
  container.innerHTML = html;
  const chartRect = context.chart.canvas.getBoundingClientRect();
  if (context.tooltip._eventPosition.x < chartRect.width / 2) {
    container.style.left = (context.tooltip._eventPosition.x + 15) + 'px';
    container.style.right = '';
  } else {
    container.style.right = (chartRect.width - context.tooltip._eventPosition.x + 15) + 'px';
    container.style.left = '';
  }
  container.style.top = '5px';
  container.style.bottom = '';
}
