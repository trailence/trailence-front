export const gradeColors = [
  '#D8FFD8', // 5%-
  '#FFD890', // 7% to 5%
  '#F0A040', // 10% to 7%
  '#C05016', // 15% to 10%
  '#700000' // 15%+
];
  export const gradeLegend = [
    '± 5%',
    '> 5%',
    '> 7%',
    '> 10%',
    '> 15%'
  ];
  export function getGradeRange(grade: number): number {
    if (grade <= 0.05) return 0;
    if (grade <= 0.07) return 1;
    if (grade <= 0.1) return 2;
    if (grade <= 0.15) return 3;
    return 4;
  }
